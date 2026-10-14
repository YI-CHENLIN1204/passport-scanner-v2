# Security & Privacy

This project processes identity-document data, so source code and private working data must remain strictly separated.

## Never commit

- Real passport, Taiwan ID, or Taiwan Compatriot Permit images
- Real traveler names, document numbers, national ID numbers, MRZ contents, or database exports
- `.env` files, API keys, passwords, private keys, service-account credentials, or deployment secrets
- OCR training or validation exports derived from real documents

## Repository-safe material

- Source code
- Synthetic test fixtures
- Schemas and architecture documentation
- Empty / placeholder environment templates such as `.env.example`
- Aggregate accuracy metrics that do not expose individual records

## Local secrets

Local database credentials are supplied through environment variables. The committed `.env.example` contains placeholders only and must not be used as a production secret.

## Public screenshots

Any screenshot intended for a public README or portfolio must use synthetic data or be fully de-identified before it is committed.
