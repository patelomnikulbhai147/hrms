# Flutter Integration Guide

## 1. Dio setup + auth header
```dart
final dio = Dio(BaseOptions(baseUrl: 'http://localhost:5000'));
final storage = const FlutterSecureStorage();

dio.interceptors.add(InterceptorsWrapper(
  onRequest: (o, h) async {
    final t = await storage.read(key: 'accessToken');
    if (t != null) o.headers['Authorization'] = 'Bearer $t';
    h.next(o);
  },
  onError: (e, h) async {
    if (e.response?.statusCode == 401) {
      final r = await storage.read(key: 'refreshToken');
      if (r != null) {
        try {
          final res = await Dio(BaseOptions(baseUrl: dio.options.baseUrl))
              .post('/api/app/auth/refresh', data: {'refreshToken': r});
          final at = res.data['data']['accessToken'];
          await storage.write(key: 'accessToken', value: at);
          final req = e.requestOptions..headers['Authorization'] = 'Bearer $at';
          return h.resolve(await dio.fetch(req));
        } catch (_) {}
      }
    }
    h.next(e);
  },
));
```

> All responses are wrapped: read `res.data['data']` for the payload, `res.data['success']`, and `res.data['errors']`.

## 2. Splash navigation
```dart
final at = await storage.read(key: 'accessToken');
if (at == null) { goPhoneScreen(); return; }
final s = (await dio.get('/api/app/auth/session')).data['data'];
if (!s['registrationCompleted'])      goResumeRegistration(s['currentStep']);
else if (s['approvalStatus'] == 'Approved') goDashboard();
else                                  goPendingApproval(); // Pending/Rejected/Changes
```

## 3. Login + OTP
```dart
final lr = await dio.post('/api/app/auth/login', data: {'mobile': mobile});
final sessionId = lr.data['data']['sessionId'];        // EMPLOYEE_NOT_FOUND → show error
// OTP screen (any 4 digits in development):
final vr = await dio.post('/api/app/auth/verify-otp', data: {'sessionId': sessionId, 'otp': otp});
await storage.write(key: 'accessToken', value: vr.data['data']['accessToken']);
await storage.write(key: 'refreshToken', value: vr.data['data']['refreshToken']);
```

## 4. Registration step (example: personal)
```dart
final r = await dio.post('/api/app/profile/personal', data: {
  'firstName': 'Om', 'lastName': 'Patel', 'dob': '1998-05-10', 'gender': 'Male',
});
final progress = r.data['data']; // { currentStep, completedSteps, completionPercentage, canSubmit }
```

## 5. Documents
```dart
await dio.post('/api/app/profile/document', data: {
  'type': 'aadhaar', 'name': 'aadhaar.jpg', 'dataUrl': 'data:image/jpeg;base64,...'
});
```

## 6. Submit + status polling
```dart
final sub = await dio.post('/api/app/profile/submit');
if (sub.data['success'] == false) {
  final missing = sub.data['errors']; // [{code, field, message}]
}
final st = (await dio.get('/api/app/profile/status')).data['data']; // approvalStatus, remarks?
```

## 7. Dashboard (after Approved)
```dart
final d = (await dio.get('/api/app/dashboard')).data['data'];
final att = (await dio.get('/api/app/attendance')).data['data'];
await dio.post('/api/app/leave/apply', data: {'leaveType':'Casual','fromDate':'2026-07-01','toDate':'2026-07-02','days':2,'reason':'...'});
```

## Checklist
- [ ] Secure token storage (flutter_secure_storage).
- [ ] Read `data` from the envelope on every call.
- [ ] Always show the OTP screen (any 4 digits in dev).
- [ ] Resume from `currentStep`; never lose drafts.
- [ ] Gate the dashboard on `approvalStatus == 'Approved'`.
- [ ] Handle `errors[]` for 422 submit/leave validation.
