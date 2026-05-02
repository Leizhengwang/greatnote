from rest_framework import serializers

from .models import Note, Page


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
