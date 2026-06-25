# Flutter — Authorization Header

Every protected request (any HRMS API, not just /auth) needs:

```
Authorization: Bearer <accessToken>
```

With Dio, add an interceptor so you never set it manually:

```dart
dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) async {
    final token = await storage.read(key: 'accessToken');
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  },
));
```

The same access token works for **all** existing HRMS endpoints (attendance, leave,
etc.) — not only the auth routes.
