from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .models import Note, Page
from . import services


class AuthServiceTests(TestCase):

    def test_register_user_creates_user_and_token(self):
        user, token = services.register_user("alice", "s3cret-pass")
        self.assertEqual(user.username, "alice")
        self.assertTrue(user.check_password("s3cret-pass"))
        self.assertEqual(token.user, user)

    def test_register_user_rejects_blank_username(self):
        with self.assertRaises(ValueError):
            services.register_user("   ", "password")

    def test_register_user_rejects_blank_password(self):
        with self.assertRaises(ValueError):
            services.register_user("alice", "")

    def test_register_user_rejects_duplicate_username(self):
        services.register_user("alice", "password")
        with self.assertRaises(ValueError):
            services.register_user("alice", "different")

    def test_login_user_returns_user_and_token_on_valid_credentials(self):
        services.register_user("alice", "password")
        user, token = services.login_user("alice", "password")
        self.assertIsNotNone(user)
        self.assertIsNotNone(token)
        self.assertEqual(user.username, "alice")

    def test_login_user_returns_none_on_invalid_password(self):
        services.register_user("alice", "password")
        user, token = services.login_user("alice", "wrong")
        self.assertIsNone(user)
        self.assertIsNone(token)

    def test_login_user_returns_none_on_unknown_username(self):
        user, token = services.login_user("nobody", "password")
        self.assertIsNone(user)
        self.assertIsNone(token)

    def test_login_user_reuses_existing_token(self):
        _, original = services.register_user("alice", "password")
        _, again = services.login_user("alice", "password")
        self.assertEqual(original.key, again.key)

    def test_logout_user_deletes_token(self):
        user, _ = services.register_user("alice", "password")
        services.logout_user(user)
        self.assertFalse(Token.objects.filter(user=user).exists())


class NoteServiceTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="u1", password="p")

    # ------------------------------------------------------------------ #
    # create_note                                                          #
    # ------------------------------------------------------------------ #

    def test_create_note_returns_note_instance(self):
        note = services.create_note(self.user)
        self.assertIsInstance(note, Note)
        self.assertIsNotNone(note.pk)

    def test_create_note_with_title_and_body(self):
        note = services.create_note(self.user, title="My Title", body="My Body")
        self.assertEqual(note.title, "My Title")
        self.assertEqual(note.body, "My Body")

    def test_create_note_with_defaults_gives_empty_strings(self):
        note = services.create_note(self.user)
        self.assertEqual(note.title, "")
        self.assertEqual(note.body, "")

    def test_create_note_sets_timestamps(self):
        note = services.create_note(self.user)
        self.assertIsNotNone(note.created_at)
        self.assertIsNotNone(note.updated_at)

    def test_create_note_assigns_user(self):
        note = services.create_note(self.user)
        self.assertEqual(note.user, self.user)

    # ------------------------------------------------------------------ #
    # get_note                                                             #
    # ------------------------------------------------------------------ #

    def test_get_note_returns_correct_note(self):
        created = services.create_note(self.user, title="Find Me")
        fetched = services.get_note(self.user, created.pk)
        self.assertEqual(fetched.pk, created.pk)
        self.assertEqual(fetched.title, "Find Me")

    def test_get_note_raises_does_not_exist_for_missing_id(self):
        with self.assertRaises(Note.DoesNotExist):
            services.get_note(self.user, 99999)

    def test_get_note_raises_does_not_exist_for_other_users_note(self):
        other = User.objects.create_user(username="u2", password="p")
        theirs = services.create_note(other, title="theirs")
        with self.assertRaises(Note.DoesNotExist):
            services.get_note(self.user, theirs.pk)

    # ------------------------------------------------------------------ #
    # list_notes                                                           #
    # ------------------------------------------------------------------ #

    def test_list_notes_returns_all_notes(self):
        for i in range(3):
            services.create_note(self.user, title=f"Note {i}")
        self.assertEqual(services.list_notes(self.user).count(), 3)

    def test_list_notes_ordered_by_updated_at_descending(self):
        first = services.create_note(self.user, title="First")
        services.create_note(self.user, title="Second")
        services.rename_note(self.user, first.pk, "First (updated)")
        notes = list(services.list_notes(self.user))
        self.assertEqual(notes[0].pk, first.pk)

    def test_list_notes_empty_when_no_notes_exist(self):
        self.assertEqual(services.list_notes(self.user).count(), 0)

    def test_list_notes_excludes_other_users_notes(self):
        other = User.objects.create_user(username="u2", password="p")
        services.create_note(self.user, title="mine")
        services.create_note(other, title="theirs")
        titles = list(services.list_notes(self.user).values_list("title", flat=True))
        self.assertEqual(titles, ["mine"])

    # ------------------------------------------------------------------ #
    # rename_note                                                          #
    # ------------------------------------------------------------------ #

    def test_rename_note_updates_title(self):
        note = services.create_note(self.user, title="Old")
        updated = services.rename_note(self.user, note.pk, "New")
        self.assertEqual(updated.title, "New")

    def test_rename_note_does_not_change_body(self):
        note = services.create_note(self.user, title="T", body="Keep this")
        services.rename_note(self.user, note.pk, "New Title")
        note.refresh_from_db()
        self.assertEqual(note.body, "Keep this")

    def test_rename_note_raises_does_not_exist_for_missing_id(self):
        with self.assertRaises(Note.DoesNotExist):
            services.rename_note(self.user, 99999, "x")

    def test_rename_note_to_empty_string_is_allowed(self):
        note = services.create_note(self.user, title="Something")
        updated = services.rename_note(self.user, note.pk, "")
        self.assertEqual(updated.title, "")

    def test_rename_note_cannot_touch_other_users_note(self):
        other = User.objects.create_user(username="u2", password="p")
        theirs = services.create_note(other, title="theirs")
        with self.assertRaises(Note.DoesNotExist):
            services.rename_note(self.user, theirs.pk, "hijacked")

    # ------------------------------------------------------------------ #
    # update_body                                                          #
    # ------------------------------------------------------------------ #

    def test_update_body_updates_body_field(self):
        note = services.create_note(self.user, body="old body")
        updated = services.update_body(self.user, note.pk, "new body")
        self.assertEqual(updated.body, "new body")

    def test_update_body_does_not_change_title(self):
        note = services.create_note(self.user, title="Keep Me", body="old")
        services.update_body(self.user, note.pk, "new")
        note.refresh_from_db()
        self.assertEqual(note.title, "Keep Me")

    def test_update_body_raises_does_not_exist_for_missing_id(self):
        with self.assertRaises(Note.DoesNotExist):
            services.update_body(self.user, 99999, "x")

    def test_update_body_to_empty_string_is_allowed(self):
        note = services.create_note(self.user, body="something")
        updated = services.update_body(self.user, note.pk, "")
        self.assertEqual(updated.body, "")

    # ------------------------------------------------------------------ #
    # delete_note                                                          #
    # ------------------------------------------------------------------ #

    def test_delete_note_removes_note_from_database(self):
        note = services.create_note(self.user)
        pk = note.pk
        services.delete_note(self.user, pk)
        self.assertFalse(Note.objects.filter(pk=pk).exists())

    def test_delete_note_raises_does_not_exist_for_missing_id(self):
        with self.assertRaises(Note.DoesNotExist):
            services.delete_note(self.user, 99999)

    def test_delete_note_cannot_delete_other_users_note(self):
        other = User.objects.create_user(username="u2", password="p")
        theirs = services.create_note(other)
        with self.assertRaises(Note.DoesNotExist):
            services.delete_note(self.user, theirs.pk)
        self.assertTrue(Note.objects.filter(pk=theirs.pk).exists())

    # ------------------------------------------------------------------ #
    # search_notes                                                         #
    # ------------------------------------------------------------------ #

    def test_search_notes_matches_title(self):
        services.create_note(self.user, title="Django tips")
        results = services.search_notes(self.user, "django")
        self.assertEqual(results.count(), 1)

    def test_search_notes_matches_body(self):
        services.create_note(self.user, body="python is great")
        results = services.search_notes(self.user, "Python")
        self.assertEqual(results.count(), 1)

    def test_search_notes_returns_both_title_and_body_matches(self):
        services.create_note(self.user, title="hello world")
        services.create_note(self.user, body="hello there")
        results = services.search_notes(self.user, "hello")
        self.assertEqual(results.count(), 2)

    def test_search_notes_returns_empty_for_no_match(self):
        services.create_note(self.user, title="nothing relevant")
        results = services.search_notes(self.user, "zzznomatch")
        self.assertEqual(results.count(), 0)

    def test_search_notes_is_case_insensitive(self):
        services.create_note(self.user, title="hello")
        results = services.search_notes(self.user, "HELLO")
        self.assertEqual(results.count(), 1)

    def test_search_notes_excludes_non_matching_notes(self):
        services.create_note(self.user, title="alpha")
        services.create_note(self.user, title="beta")
        services.create_note(self.user, title="gamma")
        results = services.search_notes(self.user, "beta")
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().title, "beta")

    def test_search_notes_excludes_other_users_matches(self):
        other = User.objects.create_user(username="u2", password="p")
        services.create_note(other, title="hello other")
        services.create_note(self.user, title="hello mine")
        results = services.search_notes(self.user, "hello")
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().title, "hello mine")

    def test_search_notes_matches_page_body(self):
        note = services.create_note(self.user, title="")
        services.update_page_body(self.user, note.pages.first().pk, "python is great")
        results = services.search_notes(self.user, "python")
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().pk, note.pk)

    def test_search_notes_returns_note_once_when_multiple_pages_match(self):
        note = services.create_note(self.user, title="")
        services.update_page_body(self.user, note.pages.first().pk, "hello one")
        second = services.insert_page(self.user, note.pk)
        services.update_page_body(self.user, second.pk, "hello two")
        results = services.search_notes(self.user, "hello")
        self.assertEqual(results.count(), 1)

    def test_search_notes_excludes_other_users_page_matches(self):
        other = User.objects.create_user(username="u2", password="p")
        their_note = services.create_note(other, title="")
        services.update_page_body(other, their_note.pages.first().pk, "secret content")
        results = services.search_notes(self.user, "secret")
        self.assertEqual(results.count(), 0)

    # ------------------------------------------------------------------ #
    # filter_by_date                                                       #
    # ------------------------------------------------------------------ #

    def _note_with_created(self, days_ago, title=""):
        note = services.create_note(self.user, title=title)
        Note.objects.filter(pk=note.pk).update(
            created_at=timezone.now() - timedelta(days=days_ago)
        )
        return Note.objects.get(pk=note.pk)

    def test_filter_by_created_after_returns_newer_notes(self):
        self._note_with_created(10, title="old")
        self._note_with_created(1, title="new")
        cutoff = (date.today() - timedelta(days=5)).isoformat()
        results = services.filter_by_date(self.user, created_after=cutoff)
        titles = list(results.values_list("title", flat=True))
        self.assertIn("new", titles)
        self.assertNotIn("old", titles)

    def test_filter_by_created_before_returns_older_notes(self):
        self._note_with_created(10, title="old")
        self._note_with_created(1, title="new")
        cutoff = (date.today() - timedelta(days=5)).isoformat()
        results = services.filter_by_date(self.user, created_before=cutoff)
        titles = list(results.values_list("title", flat=True))
        self.assertIn("old", titles)
        self.assertNotIn("new", titles)

    def test_filter_by_created_date_range_returns_only_notes_in_range(self):
        self._note_with_created(20, title="too old")
        self._note_with_created(5, title="in range")
        self._note_with_created(1, title="too new")
        after = (date.today() - timedelta(days=10)).isoformat()
        before = (date.today() - timedelta(days=3)).isoformat()
        results = services.filter_by_date(self.user, created_after=after, created_before=before)
        titles = list(results.values_list("title", flat=True))
        self.assertIn("in range", titles)
        self.assertNotIn("too old", titles)
        self.assertNotIn("too new", titles)

    def test_filter_by_modified_after(self):
        old = services.create_note(self.user, title="old")
        Note.objects.filter(pk=old.pk).update(
            updated_at=timezone.now() - timedelta(days=10)
        )
        services.create_note(self.user, title="recent")
        cutoff = (date.today() - timedelta(days=5)).isoformat()
        results = services.filter_by_date(self.user, modified_after=cutoff)
        titles = list(results.values_list("title", flat=True))
        self.assertIn("recent", titles)
        self.assertNotIn("old", titles)

    def test_filter_by_modified_before(self):
        old = services.create_note(self.user, title="old")
        Note.objects.filter(pk=old.pk).update(
            updated_at=timezone.now() - timedelta(days=10)
        )
        services.create_note(self.user, title="recent")
        cutoff = (date.today() - timedelta(days=5)).isoformat()
        results = services.filter_by_date(self.user, modified_before=cutoff)
        titles = list(results.values_list("title", flat=True))
        self.assertIn("old", titles)
        self.assertNotIn("recent", titles)

    def test_filter_by_date_with_invalid_date_string_ignores_param(self):
        services.create_note(self.user, title="a")
        services.create_note(self.user, title="b")
        results = services.filter_by_date(self.user, created_after="not-a-date")
        self.assertEqual(results.count(), 2)

    def test_filter_by_date_with_no_params_returns_all_notes(self):
        services.create_note(self.user)
        services.create_note(self.user)
        results = services.filter_by_date(self.user)
        self.assertEqual(results.count(), 2)

    def test_filter_by_date_excludes_other_users_notes(self):
        other = User.objects.create_user(username="u2", password="p")
        services.create_note(self.user, title="mine")
        services.create_note(other, title="theirs")
        results = services.filter_by_date(self.user)
        self.assertEqual(results.count(), 1)

    def test_filter_combined_created_and_modified_filters(self):
        note_a = services.create_note(self.user, title="old created, recent modified")
        Note.objects.filter(pk=note_a.pk).update(
            created_at=timezone.now() - timedelta(days=15)
        )

        note_b = services.create_note(self.user, title="recent created and modified")
        Note.objects.filter(pk=note_b.pk).update(
            created_at=timezone.now() - timedelta(days=5),
            updated_at=timezone.now() - timedelta(days=5),
        )

        after = (date.today() - timedelta(days=10)).isoformat()
        before = (date.today() - timedelta(days=3)).isoformat()
        results = services.filter_by_date(
            self.user, created_after=after, modified_before=before
        )
        titles = list(results.values_list("title", flat=True))
        self.assertIn("recent created and modified", titles)
        self.assertNotIn("old created, recent modified", titles)


class FavoriteServiceTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="u1", password="p")

    def test_toggle_favorite_sets_true_on_unfavorited_note(self):
        note = services.create_note(self.user)
        self.assertFalse(note.is_favorite)
        updated = services.toggle_favorite(self.user, note.pk)
        self.assertTrue(updated.is_favorite)

    def test_toggle_favorite_sets_false_on_favorited_note(self):
        note = services.create_note(self.user)
        Note.objects.filter(pk=note.pk).update(is_favorite=True)
        updated = services.toggle_favorite(self.user, note.pk)
        self.assertFalse(updated.is_favorite)

    def test_toggle_favorite_does_not_change_title_or_body(self):
        note = services.create_note(self.user, title="Keep", body="This")
        services.toggle_favorite(self.user, note.pk)
        note.refresh_from_db()
        self.assertEqual(note.title, "Keep")
        self.assertEqual(note.body, "This")

    def test_toggle_favorite_raises_does_not_exist_for_missing_id(self):
        with self.assertRaises(Note.DoesNotExist):
            services.toggle_favorite(self.user, 99999)

    def test_toggle_favorite_does_not_update_updated_at(self):
        note = services.create_note(self.user)
        before = note.updated_at
        services.toggle_favorite(self.user, note.pk)
        note.refresh_from_db()
        self.assertEqual(note.updated_at, before)

    def test_list_favorites_returns_only_favorited_notes(self):
        fav = services.create_note(self.user, title="Starred")
        Note.objects.filter(pk=fav.pk).update(is_favorite=True)
        services.create_note(self.user, title="Not starred")
        services.create_note(self.user, title="Also not starred")
        results = services.list_favorites(self.user)
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().title, "Starred")

    def test_list_favorites_returns_empty_when_none_favorited(self):
        services.create_note(self.user)
        services.create_note(self.user)
        self.assertEqual(services.list_favorites(self.user).count(), 0)

    def test_list_favorites_excludes_other_users(self):
        other = User.objects.create_user(username="u2", password="p")
        theirs = services.create_note(other, title="their fav")
        Note.objects.filter(pk=theirs.pk).update(is_favorite=True)
        self.assertEqual(services.list_favorites(self.user).count(), 0)

    def test_create_note_defaults_is_favorite_to_false(self):
        note = services.create_note(self.user)
        self.assertFalse(note.is_favorite)


class PageServiceTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="u1", password="p")

    def test_create_note_creates_initial_page(self):
        note = services.create_note(self.user)
        self.assertEqual(note.pages.count(), 1)
        self.assertEqual(note.pages.first().order, 0)

    def test_list_pages_returns_all_pages_for_note(self):
        note = services.create_note(self.user)
        services.insert_page(self.user, note.pk, after_page_id=note.pages.first().pk)
        self.assertEqual(services.list_pages(self.user, note.pk).count(), 2)

    def test_list_pages_ordered_by_order(self):
        note = services.create_note(self.user)
        first_page = note.pages.first()
        second_page = services.insert_page(self.user, note.pk, after_page_id=first_page.pk)
        pages = list(services.list_pages(self.user, note.pk))
        self.assertEqual(pages[0].pk, first_page.pk)
        self.assertEqual(pages[1].pk, second_page.pk)

    def test_list_pages_raises_does_not_exist_for_missing_note(self):
        with self.assertRaises(Note.DoesNotExist):
            services.list_pages(self.user, 99999)

    def test_list_pages_raises_does_not_exist_for_other_users_note(self):
        other = User.objects.create_user(username="u2", password="p")
        theirs = services.create_note(other)
        with self.assertRaises(Note.DoesNotExist):
            services.list_pages(self.user, theirs.pk)

    def test_insert_page_at_end_when_no_after_page_id(self):
        note = services.create_note(self.user)
        first_page = note.pages.first()
        new_page = services.insert_page(self.user, note.pk)
        self.assertGreater(new_page.order, first_page.order)
        self.assertEqual(note.pages.count(), 2)

    def test_insert_page_after_specified_page_shifts_later_pages(self):
        note = services.create_note(self.user)
        p1 = note.pages.first()
        p3 = services.insert_page(self.user, note.pk)
        p2 = services.insert_page(self.user, note.pk, after_page_id=p1.pk)
        p3.refresh_from_db()
        self.assertEqual(p2.order, p1.order + 1)
        self.assertGreater(p3.order, p2.order)

    def test_insert_page_raises_does_not_exist_for_missing_note(self):
        with self.assertRaises(Note.DoesNotExist):
            services.insert_page(self.user, 99999)

    def test_delete_page_removes_page(self):
        note = services.create_note(self.user)
        p2 = services.insert_page(self.user, note.pk)
        services.delete_page(self.user, p2.pk)
        self.assertEqual(note.pages.count(), 1)
        self.assertFalse(note.pages.filter(pk=p2.pk).exists())

    def test_delete_page_raises_value_error_when_last_page(self):
        note = services.create_note(self.user)
        with self.assertRaises(ValueError):
            services.delete_page(self.user, note.pages.first().pk)

    def test_delete_page_raises_does_not_exist_for_missing_page(self):
        with self.assertRaises(Page.DoesNotExist):
            services.delete_page(self.user, 99999)

    def test_delete_page_cannot_delete_other_users_page(self):
        other = User.objects.create_user(username="u2", password="p")
        theirs = services.create_note(other)
        services.insert_page(other, theirs.pk)
        with self.assertRaises(Page.DoesNotExist):
            services.delete_page(self.user, theirs.pages.first().pk)

    def test_update_page_body_updates_body(self):
        note = services.create_note(self.user)
        page = note.pages.first()
        updated = services.update_page_body(self.user, page.pk, "new content")
        self.assertEqual(updated.body, "new content")

    def test_update_page_body_raises_does_not_exist_for_missing_page(self):
        with self.assertRaises(Page.DoesNotExist):
            services.update_page_body(self.user, 99999, "x")

    def test_update_page_body_cannot_touch_other_users_page(self):
        other = User.objects.create_user(username="u2", password="p")
        theirs = services.create_note(other)
        with self.assertRaises(Page.DoesNotExist):
            services.update_page_body(self.user, theirs.pages.first().pk, "hijack")


class AIReviseServiceTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="u1", password="p")
        self.note = services.create_note(self.user)
        self.page = self.note.pages.first()

    def _mock_client(self, response_text):
        mock_client = MagicMock()
        mock_msg = MagicMock()
        mock_msg.content = [MagicMock(text=response_text)]
        mock_client.messages.create.return_value = mock_msg
        return mock_client

    @patch('notes.services.anthropic.Anthropic')
    def test_improve_returns_result_dict(self, MockAnthropic):
        MockAnthropic.return_value = self._mock_client("Better text here.")
        result = services.ai_revise_text(self.user, self.page.pk, "improve", "Hello world")
        self.assertEqual(result, {"result": "Better text here."})

    @patch('notes.services.anthropic.Anthropic')
    def test_shorter_returns_result_dict(self, MockAnthropic):
        MockAnthropic.return_value = self._mock_client("Short.")
        result = services.ai_revise_text(self.user, self.page.pk, "shorter", "This is a long sentence.")
        self.assertEqual(result, {"result": "Short."})

    @patch('notes.services.anthropic.Anthropic')
    def test_longer_returns_result_dict(self, MockAnthropic):
        MockAnthropic.return_value = self._mock_client("Expanded text.")
        result = services.ai_revise_text(self.user, self.page.pk, "longer", "Short.")
        self.assertEqual(result, {"result": "Expanded text."})

    @patch('notes.services.anthropic.Anthropic')
    def test_grammar_returns_errors_list(self, MockAnthropic):
        errors_json = '[{"original": "teh", "correction": "the", "explanation": "Typo", "offset": 0}]'
        MockAnthropic.return_value = self._mock_client(errors_json)
        result = services.ai_revise_text(self.user, self.page.pk, "grammar", "teh cat sat")
        self.assertIn("errors", result)
        self.assertEqual(len(result["errors"]), 1)
        self.assertEqual(result["errors"][0]["original"], "teh")
        self.assertEqual(result["errors"][0]["correction"], "the")

    @patch('notes.services.anthropic.Anthropic')
    def test_grammar_no_errors_returns_empty_list(self, MockAnthropic):
        MockAnthropic.return_value = self._mock_client("[]")
        result = services.ai_revise_text(self.user, self.page.pk, "grammar", "Perfect prose.")
        self.assertEqual(result, {"errors": []})

    def test_invalid_action_raises_value_error(self):
        with self.assertRaises(ValueError):
            services.ai_revise_text(self.user, self.page.pk, "rewrite", "text")

    def test_empty_text_raises_value_error(self):
        with self.assertRaises(ValueError):
            services.ai_revise_text(self.user, self.page.pk, "improve", "")

    def test_whitespace_only_text_raises_value_error(self):
        with self.assertRaises(ValueError):
            services.ai_revise_text(self.user, self.page.pk, "improve", "   ")

    def test_ownership_enforced_for_other_users_page(self):
        other = User.objects.create_user(username="u2", password="p")
        their_note = services.create_note(other)
        with self.assertRaises(Page.DoesNotExist):
            services.ai_revise_text(self.user, their_note.pages.first().pk, "improve", "text")

    def test_missing_page_raises_does_not_exist(self):
        with self.assertRaises(Page.DoesNotExist):
            services.ai_revise_text(self.user, 99999, "improve", "text")
