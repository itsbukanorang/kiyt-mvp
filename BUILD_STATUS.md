# Status build KIYT

Sumber scope: MVP_BUILD_PLAN.md + ARCHITECTURE_RUST_PYTHON.md.
Status terakhir: 2026-11-03 04:35:36 WIB.

| Modul | Status | Bukti terakhir | Dependency / kebutuhan |
|---|---|---|---|
| 0 Audit VPS | PASS | VPS srv2068231, Docker, Apache, service existing, port dan isolation boundary diverifikasi | — |
| 1 Console shell + Rust/Python foundation | PASS | console.kiyt.io HTTPS; Next.js → Rust /api/v1 → authenticated private Python; isolation/regression PASS | — |
| 2 PostgreSQL + Qdrant | PASS | PostgreSQL + Qdrant dedicated/private; auth, persistence, least-privilege role, restart, volume dan no-public-port PASS | — |
| 3 Member auth | NOT_STARTED | — | Modul 2 |
| 4 Workspace + API key | NOT_STARTED | — | Modul 3 |
| 5 Cognition pertama | NOT_STARTED | — | Modul 4 + Meta muse-spark-1.3 Standard |
| 6 Tiga memory | NOT_STARTED | — | Modul 2 + 5 |
| 7 Observation loop | NOT_STARTED | — | Modul 5 + 6 |
| 8 Playground | NOT_STARTED | — | Modul 3–7 |
| 9 Runs + usage | NOT_STARTED | — | Modul 7–8 |
| 10 Dokumentasi | NOT_STARTED | — | Modul 8–9 |
| 11 Release verification | NOT_STARTED | — | Semua modul sebelumnya |

## Modul 0 — PASS

- Dedicated Linux build user: `kiyt-mvp`.
- Repository: `itsbukanorang/kiyt-mvp`, branch `main`.
- GitHub SSH deploy key verified.
- Existing `kiyt.io` dan FLWME tetap berjalan.
- KIYT mempunyai user, repository, port dan runtime boundary sendiri.

## Modul 1 — PASS

### Berfungsi

- Next.js console tersedia di `https://console.kiyt.io`.
- Route dasar aktif: `/`, `/login`, `/signup`, `/myaccount`, `/docs`.
- Apache dedicated vhost meneruskan console ke KIYT edge.
- KIYT edge hanya dipublish sebagai `127.0.0.1:18180`.
- `/api/v1/*` melewati Rust Axum/Tokio gateway.
- Rust melakukan authenticated private HTTP call ke Python FastAPI runtime.
- Python tanpa internal service token menghasilkan HTTP 401.
- Next.js, Rust dan Python tidak mempunyai direct host/public port.
- Rust image dapat dibangun ulang dari `services/gateway/Dockerfile`.
- Cargo development workflow menggunakan `deploy/rust-cargo.sh`.
- Next.js production audit saat setup menghasilkan 0 vulnerabilities.
- Temporary backoffice berada di luar repository:
  `/home/kiyt-mvp/private/backoffice-temp`.

### Active flow

```text
Cloudflare
  -> Apache console.kiyt.io
  -> 127.0.0.1:18180 KIYT edge
       -> pages -> Next.js
       -> /api/v1/* -> Rust
                         -> authenticated private Python
```

ARCHITECTURE_RUST_PYTHON.md menjadi authority untuk routing API:
public `/api/v1/*` melewati Rust dan Python tetap private.

### Belum selesai

- Dedicated PostgreSQL KIYT belum dibuat.
- Dedicated Qdrant KIYT belum dibuat.
- Better Auth belum diaktifkan.
- Meta muse-spark-1.3 Standard belum dipanggil.
- Cognitive run/memory/observation belum dibangun.
- Temporary backoffice belum dipublish.

### Langkah berikut

Modul 2 — PostgreSQL + Qdrant dedicated, private dan persistent.


## Modul 2 — PASS

### PostgreSQL

- Dedicated KIYT PostgreSQL menggunakan image `postgres:17.11-bookworm`.
- Database operasional: `kiyt`.
- Application role: `kiyt_app`.
- `kiyt_app` LOGIN aktif dan bukan superuser, bukan CREATEDB, bukan CREATEROLE.
- Application role dapat membuat/menulis object pada database KIYT.
- Data probe bertahan setelah container restart.
- Named volume: `kiyt-mvp-postgres-data`.
- Tidak ada PostgreSQL host/public port.
- Bootstrap role/database berada di `deploy/postgres/00-bootstrap.sh`.

### Qdrant

- Dedicated KIYT Qdrant menggunakan image `qdrant/qdrant:v1.20.0`.
- API key wajib; request tanpa key menghasilkan HTTP 401.
- Runtime Python dapat mengakses Qdrant melalui private Docker DNS/network.
- Test vector/payload bertahan setelah Qdrant restart.
- Named volume: `kiyt-mvp-qdrant-data`.
- Tidak ada Qdrant host/public port.
- Test collection Module 2 sudah dihapus setelah verification.

### Secrets

- PostgreSQL credential berada di `/home/kiyt-mvp/private/postgres.env`.
- Qdrant credential berada di `/home/kiyt-mvp/private/qdrant.env`.
- Secret files tidak disimpan di repository dan tidak dicetak pada build log.
- KIYT datastore tidak menggunakan PostgreSQL/Qdrant milik FLWME.

### Belum selesai

- Better Auth schema/session belum dipasang.
- Application schema workspace/API key/run belum dibuat.
- Runtime belum menggunakan Qdrant untuk production memory collections.
- Meta cognition belum dihubungkan.

### Langkah berikut

Modul 3 — Better Auth email/password dengan PostgreSQL KIYT.
