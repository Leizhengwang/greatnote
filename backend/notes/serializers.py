from rest_framework import serializers

from .models import Note, Page, PageAttachment, PublicPageShare, UserPageShare


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["id", "title", "body", "is_favorite", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ["id", "note", "body", "order"]
        read_only_fields = ["id", "note", "order"]


class PublicShareSerializer(serializers.ModelSerializer):
    token = serializers.UUIDField(read_only=True)

    class Meta:
        model = PublicPageShare
        fields = ["token", "is_active", "created_at"]
        read_only_fields = ["token", "is_active", "created_at"]


class UserShareSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="shared_with.username", read_only=True)
    shared_with_id = serializers.IntegerField(source="shared_with.id", read_only=True)

    class Meta:
        model = UserPageShare
        fields = ["id", "shared_with_id", "username", "created_at"]
        read_only_fields = ["id", "shared_with_id", "username", "created_at"]


class PageAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PageAttachment
        fields = ["id", "filename", "size", "uploaded_at"]
        read_only_fields = ["id", "filename", "size", "uploaded_at"]


class SharedPageSerializer(serializers.ModelSerializer):
    note_title = serializers.CharField(source="note.title", read_only=True)

    class Meta:
        model = Page
        fields = ["id", "body", "order", "note_title"]
        read_only_fields = ["id", "body", "order", "note_title"]
