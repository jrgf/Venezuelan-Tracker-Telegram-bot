# Bot de Telegram Localizador de Personas — Terremoto Venezuela 2026

Bot de Telegram por long polling para consultar personas localizadas usando el
portal oficial `https://localizadosvenezuela.com`.

## Configuracion

Crea un `.env` o exporta estas variables:

| Variable | Descripcion |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token del bot entregado por BotFather. |
| `SITE_URL` | Portal de busqueda. Default: `https://localizadosvenezuela.com`. |

No necesitas URL publica ni webhook. Al iniciar, el bot limpia cualquier webhook
existente en Telegram y usa `getUpdates`.

## Uso

En un chat privado con el bot:

- `/start`, `#` o `ayuda`: muestra instrucciones.
- Cedula: envia un numero como `12345678`.
- Nombre: envia nombre y/o apellido, por ejemplo `Johanna Aguero`.

## Desarrollo

```bash
npm install
npm run dev
```

## Docker

```bash
docker compose up --build
```

Para produccion:

```bash
docker compose -f docker-compose-prod.yml up --build -d
```
