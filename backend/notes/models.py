import uuid

from django.conf import settings
from django.db import models


class Note(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notes",
        null=True,
    )
    title = models.CharField(max_length=255, blank=True, default="")
    body = models.TextField(blank=True, default="")
    is_favorite = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title or f"Note {self.pk}"


class Page(models.Model):
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name="pages")
    body = models.TextField(blank=True, default="")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]


class PublicPageShare(models.Model):
    page = models.OneToOneField(Page, on_delete=models.CASCADE, related_name="public_share")
    token = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class UserPageShare(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="user_shares")
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shared_pages",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("page", "shared_with")]


def _attachment_upload_path(instance, filename):
    return f"attachments/user_{instance.page.note.user_id}/page_{instance.page_id}/{filename}"


class PageAttachment(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=_attachment_upload_path)
    filename = models.CharField(max_length=255)
    size = models.BigIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]
