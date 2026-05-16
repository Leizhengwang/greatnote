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
    path("notes/<int:note_pk>/pages/<int:pk>/share/public/", views.PagePublicShareView.as_view(), name="page-public-share"),
    path("notes/<int:note_pk>/pages/<int:pk>/share/users/", views.PageUserShareListView.as_view(), name="page-user-share-list"),
    path("notes/<int:note_pk>/pages/<int:pk>/share/users/<int:shared_user_id>/", views.PageUserShareDetailView.as_view(), name="page-user-share-detail"),
    path("shared/<uuid:token>/", views.PublicPageView.as_view(), name="page-public-view"),
    path("pages/<int:pk>/shared-with-me/", views.SharedWithMePageView.as_view(), name="page-shared-with-me"),
    path("notes/<int:note_pk>/pages/<int:pk>/ai-revise/", views.AIReviseView.as_view(), name="ai-revise"),
    path("notes/<int:note_pk>/pages/<int:pk>/attachments/", views.PageAttachmentListCreateView.as_view(), name="page-attachments"),
    path("notes/<int:note_pk>/pages/<int:pk>/attachments/<int:att_pk>/", views.PageAttachmentDownloadDeleteView.as_view(), name="page-attachment-detail"),
]
