import json
import os

import anthropic
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import F, Max, Q
from django.utils.dateparse import parse_date
from rest_framework.authtoken.models import Token

from .models import Note, Page

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
