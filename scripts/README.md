# Datos iniciales

Configura en `.env` las variables `SEED_ADMIN_EMAIL`,
`SEED_ADMIN_PASSWORD`, `SEED_USER_EMAIL` y `SEED_USER_PASSWORD`.

Valida los documentos sin conectarse a MongoDB:

```bash
npm run seed:dry-run
```

Inserta los datos iniciales:

```bash
npm run seed
```

El proceso es idempotente: identifica los datos iniciales por nombre, titulo,
texto o correo y solo crea los registros que no existen. Las contraseñas de
usuarios existentes no se reemplazan.
