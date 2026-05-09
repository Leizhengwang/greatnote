from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Note, Page
from . import services
from .serializers import NoteSerializer, PageSerializer


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
