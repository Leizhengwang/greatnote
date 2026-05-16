from django.http import FileResponse

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Note, Page, PageAttachment
from . import services
from .serializers import (
    NoteSerializer,
    PageAttachmentSerializer,
    PageSerializer,
    PublicShareSerializer,
    SharedPageSerializer,
    UserShareSerializer,
)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            user, token = services.register_user(
                request.data.get("username"),
                request.data.get("password"),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"token": token.key, "username": user.username},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user, token = services.login_user(
            request.data.get("username"),
            request.data.get("password"),
        )
        if user is None:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response({"token": token.key, "username": user.username})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        services.logout_user(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"username": request.user.username})


class NoteListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        favorites = request.query_params.get("favorites")
        created_after = request.query_params.get("created_after")
        created_before = request.query_params.get("created_before")
        modified_after = request.query_params.get("modified_after")
        modified_before = request.query_params.get("modified_before")

        if q:
            notes = services.search_notes(request.user, q)
        elif favorites == "true":
            notes = services.list_favorites(request.user)
        elif any([created_after, created_before, modified_after, modified_before]):
            notes = services.filter_by_date(
                request.user,
                created_after, created_before, modified_after, modified_before,
            )
        else:
            notes = services.list_notes(request.user)

        return Response(NoteSerializer(notes, many=True).data)

    def post(self, request):
        note = services.create_note(
            request.user,
            title=request.data.get("title", ""),
            body=request.data.get("body", ""),
        )
        return Response(NoteSerializer(note).data, status=status.HTTP_201_CREATED)


class NoteDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            note = services.get_note(request.user, pk)
        except Note.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(NoteSerializer(note).data)

    def patch(self, request, pk):
        try:
            note = None
            if "title" in request.data:
                note = services.rename_note(request.user, pk, request.data["title"])
            if "body" in request.data:
                note = services.update_body(request.user, pk, request.data["body"])
            if "is_favorite" in request.data:
                note = services.toggle_favorite(request.user, pk)
            if note is None:
                note = services.get_note(request.user, pk)
        except Note.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(NoteSerializer(note).data)

    def delete(self, request, pk):
        try:
            services.delete_note(request.user, pk)
        except Note.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotePageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, note_pk):
        try:
            pages = services.list_pages(request.user, note_pk)
        except Note.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(PageSerializer(pages, many=True).data)

    def post(self, request, note_pk):
        after_page_id = request.data.get("after_page_id")
        try:
            page = services.insert_page(request.user, note_pk, after_page_id)
        except Note.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(PageSerializer(page).data, status=status.HTTP_201_CREATED)


class NoteRankingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        note_ids = request.data.get("note_ids", [])
        criteria = (request.data.get("criteria") or "").strip()
        if not note_ids:
            return Response({"error": "note_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not criteria:
            return Response({"error": "criteria is required"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(services.rank_notes_by_criteria(request.user, note_ids, criteria))


class ProjectTrackerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        note_ids = request.data.get("note_ids", [])
        if not note_ids:
            return Response({"error": "note_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = services.analyze_projects(request.user, note_ids)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "AI service error"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)


class NotePageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, note_pk, pk):
        try:
            page = services.update_page_body(request.user, pk, request.data.get("body", ""))
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(PageSerializer(page).data)

    def delete(self, request, note_pk, pk):
        try:
            services.delete_page(request.user, pk)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PagePublicShareView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, note_pk, pk):
        try:
            share = services.get_public_share(request.user, pk)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if share is None:
            return Response({"token": None, "is_active": False})
        return Response(PublicShareSerializer(share).data)

    def post(self, request, note_pk, pk):
        try:
            share = services.create_public_share(request.user, pk)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(PublicShareSerializer(share).data, status=status.HTTP_201_CREATED)

    def delete(self, request, note_pk, pk):
        try:
            services.revoke_public_share(request.user, pk)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageUserShareListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, note_pk, pk):
        try:
            shares = services.list_user_shares(request.user, pk)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(UserShareSerializer(shares, many=True).data)

    def post(self, request, note_pk, pk):
        username = request.data.get("username", "").strip()
        if not username:
            return Response({"error": "username is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            share = services.share_page_with_user(request.user, pk, username)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(UserShareSerializer(share).data, status=status.HTTP_201_CREATED)


class PageUserShareDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, note_pk, pk, shared_user_id):
        try:
            services.revoke_user_share(request.user, pk, shared_user_id)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicPageView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            page = services.get_page_by_token(token)
        except Exception:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(SharedPageSerializer(page).data)


class SharedWithMePageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            page = services.get_page_for_shared_user(request.user, pk)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(SharedPageSerializer(page).data)


class AIReviseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, note_pk, pk):
        action = request.data.get("action", "")
        text = request.data.get("text", "")
        try:
            result = services.ai_revise_text(request.user, pk, action, text)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "AI service error"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)


class PageAttachmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, note_pk, pk):
        try:
            attachments = services.list_attachments(request.user, pk)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(PageAttachmentSerializer(attachments, many=True).data)

    def post(self, request, note_pk, pk):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            attachment = services.upload_attachment(request.user, pk, file_obj)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PageAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)


class PageAttachmentDownloadDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, note_pk, pk, att_pk):
        try:
            attachment = services.get_attachment(request.user, att_pk)
        except PageAttachment.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        response = FileResponse(attachment.file.open("rb"), as_attachment=True, filename=attachment.filename)
        return response

    def delete(self, request, note_pk, pk, att_pk):
        try:
            services.delete_attachment(request.user, att_pk)
        except PageAttachment.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
