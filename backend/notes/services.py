import json
import math
import os
import re
from collections import Counter

import anthropic
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import F, Max, Q
from django.utils.dateparse import parse_date
from rest_framework.authtoken.models import Token

from .models import Note, Page, PageAttachment, PublicPageShare, UserPageShare

_VALID_AI_ACTIONS = {"improve", "shorter", "longer", "grammar"}


def register_user(username, password):
    username = (username or "").strip()
    if not username or not password:
        raise ValueError("Username and password are required")
    if User.objects.filter(username=username).exists():
        raise ValueError("Username already taken")
    user = User.objects.create_user(username=username, password=password)
    token = Token.objects.create(user=user)
    return user, token


def login_user(username, password):
    user = authenticate(username=(username or "").strip(), password=password or "")
    if user is None:
        return None, None
    token, _ = Token.objects.get_or_create(user=user)
    return user, token


def logout_user(user):
    Token.objects.filter(user=user).delete()


def create_note(user, title="", body=""):
    note = Note.objects.create(user=user, title=title, body=body)
    Page.objects.create(note=note, body="", order=0)
    return note


def get_note(user, note_id):
    return Note.objects.get(pk=note_id, user=user)


def list_notes(user):
    return Note.objects.filter(user=user)


def rename_note(user, note_id, title):
    note = Note.objects.get(pk=note_id, user=user)
    note.title = title
    note.save(update_fields=["title", "updated_at"])
    return note


def update_body(user, note_id, body):
    note = Note.objects.get(pk=note_id, user=user)
    note.body = body
    note.save(update_fields=["body", "updated_at"])
    return note


def delete_note(user, note_id):
    note = Note.objects.get(pk=note_id, user=user)
    note.delete()


def toggle_favorite(user, note_id):
    note = Note.objects.get(pk=note_id, user=user)
    note.is_favorite = not note.is_favorite
    note.save(update_fields=["is_favorite"])
    return note


def list_favorites(user):
    return Note.objects.filter(user=user, is_favorite=True)


def search_notes(user, query):
    return Note.objects.filter(user=user).filter(
        Q(title__icontains=query)
        | Q(body__icontains=query)
        | Q(pages__body__icontains=query)
    ).distinct()


def filter_by_date(
    user,
    created_after=None,
    created_before=None,
    modified_after=None,
    modified_before=None,
):
    filters = {"user": user}
    for param, key in [
        (created_after, "created_at__date__gte"),
        (created_before, "created_at__date__lte"),
        (modified_after, "updated_at__date__gte"),
        (modified_before, "updated_at__date__lte"),
    ]:
        if param:
            d = parse_date(param)
            if d:
                filters[key] = d
    return Note.objects.filter(**filters)


# ------------------------------------------------------------------ #
# Page services                                                        #
# ------------------------------------------------------------------ #

def list_pages(user, note_id):
    note = Note.objects.get(pk=note_id, user=user)
    return note.pages.all()


def insert_page(user, note_id, after_page_id=None):
    note = Note.objects.get(pk=note_id, user=user)
    if after_page_id is None:
        agg = note.pages.aggregate(max_order=Max("order"))
        new_order = (agg["max_order"] + 1) if agg["max_order"] is not None else 0
    else:
        ref = Page.objects.get(pk=after_page_id, note=note)
        note.pages.filter(order__gt=ref.order).update(order=F("order") + 1)
        new_order = ref.order + 1
    return Page.objects.create(note=note, body="", order=new_order)


def delete_page(user, page_id):
    page = Page.objects.get(pk=page_id, note__user=user)
    if page.note.pages.count() <= 1:
        raise ValueError("Cannot delete the last page of a note")
    page.delete()


def update_page_body(user, page_id, body):
    page = Page.objects.get(pk=page_id, note__user=user)
    page.body = body
    page.save(update_fields=["body"])
    return page


# ------------------------------------------------------------------ #
# Page sharing services                                                #
# ------------------------------------------------------------------ #

def _get_owned_page(user, page_id):
    return Page.objects.get(pk=page_id, note__user=user)


def create_public_share(user, page_id):
    page = _get_owned_page(user, page_id)
    share, _ = PublicPageShare.objects.update_or_create(
        page=page,
        defaults={"is_active": True},
    )
    return share


def revoke_public_share(user, page_id):
    page = _get_owned_page(user, page_id)
    PublicPageShare.objects.filter(page=page).update(is_active=False)


def get_page_by_token(token):
    share = PublicPageShare.objects.select_related("page").get(token=token, is_active=True)
    return share.page


def get_public_share(user, page_id):
    page = _get_owned_page(user, page_id)
    try:
        return PublicPageShare.objects.get(page=page)
    except PublicPageShare.DoesNotExist:
        return None


def share_page_with_user(user, page_id, username):
    page = _get_owned_page(user, page_id)
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        raise ValueError(f"User '{username}' not found")
    if target == user:
        raise ValueError("Cannot share a page with yourself")
    share, created = UserPageShare.objects.get_or_create(page=page, shared_with=target)
    return share


def revoke_user_share(user, page_id, shared_user_id):
    page = _get_owned_page(user, page_id)
    deleted, _ = UserPageShare.objects.filter(page=page, shared_with_id=shared_user_id).delete()
    if not deleted:
        raise UserPageShare.DoesNotExist("Share not found")


def list_user_shares(user, page_id):
    page = _get_owned_page(user, page_id)
    return UserPageShare.objects.filter(page=page).select_related("shared_with")


def get_page_for_shared_user(requesting_user, page_id):
    try:
        return Page.objects.get(pk=page_id, note__user=requesting_user)
    except Page.DoesNotExist:
        pass
    page = Page.objects.get(pk=page_id, user_shares__shared_with=requesting_user)
    return page


# ------------------------------------------------------------------ #
# AI revision                                                          #
# ------------------------------------------------------------------ #

def ai_revise_text(user, page_id, action, text):
    Page.objects.get(pk=page_id, note__user=user)  # ownership check
    if action not in _VALID_AI_ACTIONS:
        raise ValueError(f"Invalid action: {action}")
    if not text or not text.strip():
        raise ValueError("Text must not be empty")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    client = anthropic.Anthropic(api_key=api_key)

    if action == "improve":
        prompt = (
            "Improve the writing of the following text. "
            "Return only the improved text, no explanation, no preamble:\n\n" + text
        )
    elif action == "shorter":
        prompt = (
            "Make the following text shorter and more concise. "
            "Return only the condensed text, no explanation, no preamble:\n\n" + text
        )
    elif action == "longer":
        prompt = (
            "Expand and elaborate on the following text to make it longer and richer. "
            "Return only the expanded text, no explanation, no preamble:\n\n" + text
        )
    else:  # grammar
        prompt = (
            "Check the following text for grammar and spelling errors. "
            "Return a JSON array of error objects. Each object must have exactly these fields:\n"
            '  "original": the exact erroneous substring as it appears in the text,\n'
            '  "correction": the corrected replacement,\n'
            '  "explanation": a brief one-sentence explanation,\n'
            '  "offset": the zero-based character index where the error starts.\n'
            "If there are no errors return an empty JSON array []. "
            "Return only valid JSON, no markdown fences, no other text.\n\n"
            "Text:\n" + text
        )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    result_text = message.content[0].text.strip()

    if action == "grammar":
        errors = json.loads(result_text)
        return {"errors": errors}
    return {"result": result_text}


# ------------------------------------------------------------------ #
# Attachment services                                                   #
# ------------------------------------------------------------------ #

_MAX_UPLOAD_SIZE = 1024 * 1024 * 1024  # 1 GB


def upload_attachment(user, page_id, file_obj):
    page = Page.objects.get(pk=page_id, note__user=user)
    if file_obj.size > _MAX_UPLOAD_SIZE:
        raise ValueError("File exceeds the 1 GB size limit")
    attachment = PageAttachment.objects.create(
        page=page,
        file=file_obj,
        filename=file_obj.name,
        size=file_obj.size,
    )
    return attachment


def list_attachments(user, page_id):
    Page.objects.get(pk=page_id, note__user=user)  # ownership check
    return PageAttachment.objects.filter(page_id=page_id)


def get_attachment(user, attachment_id):
    return PageAttachment.objects.get(pk=attachment_id, page__note__user=user)


def delete_attachment(user, attachment_id):
    attachment = PageAttachment.objects.get(pk=attachment_id, page__note__user=user)
    attachment.file.delete(save=False)
    attachment.delete()


# ------------------------------------------------------------------ #
# Note content-based ranking                                           #
# ------------------------------------------------------------------ #

_RANKING_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "not", "no", "nor",
    "so", "if", "then", "than", "this", "that", "these", "those", "it",
    "its", "you", "your", "we", "our", "they", "their", "he", "she", "him",
    "her", "i", "my", "me", "us", "who", "which", "what", "when", "where",
    "how", "all", "any", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "here", "there", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "up", "down",
    "also", "just", "only", "about", "against", "via",
}


def _rank_tokenize(text: str) -> list:
    tokens = re.sub(r"[^a-zA-Z0-9]", " ", text).lower().split()
    return [t for t in tokens if len(t) >= 3 and t not in _RANKING_STOPWORDS]


def rank_notes_by_criteria(user, note_ids, criteria: str) -> dict:
    notes = list(
        Note.objects.filter(user=user, pk__in=note_ids).prefetch_related("pages")
    )
    if not notes:
        return {"ranked": [], "query_terms": []}

    query_terms = _rank_tokenize(criteria)

    if not query_terms:
        return {
            "ranked": [
                {
                    "rank": i + 1,
                    "note_id": n.pk,
                    "title": n.title or "(Untitled)",
                    "score": 0.0,
                    "matched_keywords": [],
                }
                for i, n in enumerate(notes)
            ],
            "query_terms": [],
        }

    def _note_tokens(note):
        title_toks = _rank_tokenize(note.title) * 3
        body_toks = _rank_tokenize(note.body)
        page_toks = [t for page in note.pages.all() for t in _rank_tokenize(page.body)]
        return title_toks + body_toks + page_toks

    doc_tokens = [_note_tokens(n) for n in notes]
    doc_freqs = [Counter(toks) for toks in doc_tokens]
    doc_lengths = [len(toks) for toks in doc_tokens]
    avg_dl = sum(doc_lengths) / len(doc_lengths)

    N = len(notes)
    k1, b = 1.5, 0.75

    scores = [0.0] * N
    matched_per_doc = [set() for _ in range(N)]

    for term in set(query_terms):
        df = sum(1 for freq in doc_freqs if term in freq)
        if df == 0:
            continue
        idf = math.log((N - df + 0.5) / (df + 0.5) + 1)
        for i, freq in enumerate(doc_freqs):
            tf = freq.get(term, 0)
            if tf == 0:
                continue
            dl = doc_lengths[i] or 1
            tf_norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avg_dl))
            scores[i] += idf * tf_norm
            matched_per_doc[i].add(term)

    ranked_indices = sorted(range(N), key=lambda i: scores[i], reverse=True)

    return {
        "ranked": [
            {
                "rank": rank + 1,
                "note_id": notes[i].pk,
                "title": notes[i].title or "(Untitled)",
                "score": round(scores[i], 4),
                "matched_keywords": sorted(matched_per_doc[i]),
            }
            for rank, i in enumerate(ranked_indices)
        ],
        "query_terms": sorted(set(query_terms)),
    }
