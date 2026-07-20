class RevEngineEnvironment {
  const RevEngineEnvironment._();

  static const defaultApiBaseUrl = String.fromEnvironment(
    'REVENGINE_API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static const appVersion = String.fromEnvironment(
    'REVENGINE_TECHNICIAN_APP_VERSION',
    defaultValue: '0.1.0',
  );
}
