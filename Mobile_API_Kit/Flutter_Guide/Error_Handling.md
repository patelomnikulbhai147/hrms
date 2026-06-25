# Flutter — Error Handling

The auth API uses a consistent envelope:

```json
{ "success": false, "code": "USER_NOT_FOUND", "message": "..." }
```

Map `code` to user-facing copy; show `message` as a fallback.

### Auto-refresh on 401 (Dio)
```dart
dio.interceptors.add(InterceptorsWrapper(
  onError: (e, handler) async {
    if (e.response?.statusCode == 401) {
      final refresh = await storage.read(key: 'refreshToken');
      if (refresh != null) {
        try {
          final r = await Dio(BaseOptions(baseUrl: dio.options.baseUrl))
              .post('/api/v1/auth/refresh', data: {'refreshToken': refresh});
          final newAccess = r.data['accessToken'];
          await storage.write(key: 'accessToken', value: newAccess);
          final req = e.requestOptions;
          req.headers['Authorization'] = 'Bearer $newAccess';
          return handler.resolve(await dio.fetch(req)); // retry once
        } catch (_) {/* fall through to login */}
      }
      // refresh failed → send the user to Login
    }
    handler.next(e);
  },
));
```

### Codes to handle explicitly
- `USER_NOT_FOUND`, `ACCOUNT_INACTIVE`, `BRANCH_DISABLED` → show on Login.
- `OTP_EXPIRED`, `INVALID_OTP`, `TOO_MANY_ATTEMPTS` → show on OTP screen (offer "Resend").
- `REFRESH_TOKEN_INVALID` → clear tokens, go to Login.
