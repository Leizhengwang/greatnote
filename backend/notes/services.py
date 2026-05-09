from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import F, Max, Q
from django.utils.dateparse import parse_date
from rest_framework.authtoken.models import Token

from .models import Note, Page, PublicPageShare, UserPageShare


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
