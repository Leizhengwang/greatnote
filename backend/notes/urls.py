from django.urls import path
from . import views

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("notes/", views.NoteListCreateView.as_view(), name="note-list-create"),
    path("notes/<int:pk>/", views.NoteDetailView.as_view(), name="note-detail"),
    path("notes/<int:note_pk>/pages/", views.NotePageListCreateView.as_view(), name="note-page-list-create"),
    path("notes/<int:note_pk>/pages/<int:pk>/", views.NotePageDetailView.as_view(), name="note-page-detail"),
    path("notes/<int:note_pk>/pages/<int:pk>/ai-revise/", views.AIReviseView.as_view(), name="ai-revise"),
]
