import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app.dart';
import 'data/auth/auth_controller.dart';
import 'data/local/app_database.dart';
import 'data/remote/api_client.dart';
import 'state/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Open the on-device database (seeds demo data on first launch) and wire the
  // API + auth before the first frame, so the app opens straight into content.
  final db = await AppDatabase.open();
  final api = ApiClient();
  final auth = AuthController(api, const FlutterSecureStorage());
  await auth.restore();
  // Not awaited: the stored session is enough to draw the first frame, and the
  // refresh only corrects it (a role edited since the last sign-in) once the
  // server answers. Awaiting it would hold the splash on a slow connection.
  unawaited(auth.refreshSession());

  runApp(
    ProviderScope(
      overrides: [
        dbProvider.overrideWithValue(db),
        apiProvider.overrideWithValue(api),
        authProvider.overrideWith((_) => auth),
      ],
      child: const VidyalayaApp(),
    ),
  );
}
