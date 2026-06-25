# Flutter — Token Storage

Use **flutter_secure_storage** (Keychain on iOS, Keystore on Android). Never store
JWTs in SharedPreferences.

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final storage = const FlutterSecureStorage();

Future<void> saveTokens(String access, String refresh) async {
  await storage.write(key: 'accessToken', value: access);
  await storage.write(key: 'refreshToken', value: refresh);
}

Future<String?> getAccess() => storage.read(key: 'accessToken');
Future<String?> getRefresh() => storage.read(key: 'refreshToken');
Future<void> clearTokens() => storage.deleteAll();
```

- Store the `user` profile in memory (and optionally a non-sensitive cache).
- Treat the **refresh token** as highly sensitive — it mints new access tokens.
