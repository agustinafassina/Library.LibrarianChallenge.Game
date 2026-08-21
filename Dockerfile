FROM node:22-alpine AS config
WORKDIR /app
COPY package.json ./
COPY scripts/generate-runtime-config.mjs ./scripts/generate-runtime-config.mjs

ARG LC_API_BASE_URL=
ARG LC_API_KEY=
ARG LC_USE_API_BOOKS=false
ARG LC_FORMSPREE_URL=https://formspree.io/f/xbdvbarg
ARG LC_RECAPTCHA_SITE_KEY=
ARG LC_MAX_RESULTS_PER_TAG=20
ARG LC_AUTO_TAG=true

ENV LC_API_BASE_URL=$LC_API_BASE_URL \
    LC_API_KEY=$LC_API_KEY \
    LC_USE_API_BOOKS=$LC_USE_API_BOOKS \
    LC_FORMSPREE_URL=$LC_FORMSPREE_URL \
    LC_RECAPTCHA_SITE_KEY=$LC_RECAPTCHA_SITE_KEY \
    LC_MAX_RESULTS_PER_TAG=$LC_MAX_RESULTS_PER_TAG \
    LC_AUTO_TAG=$LC_AUTO_TAG

RUN mkdir -p js && node scripts/generate-runtime-config.mjs

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY update.html /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY sw-reset.js /usr/share/nginx/html/
COPY --from=config /app/sw-version.js /usr/share/nginx/html/sw-version.js
COPY vendor/ /usr/share/nginx/html/vendor/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY data/ /usr/share/nginx/html/data/
COPY assets/ /usr/share/nginx/html/assets/
COPY --from=config /app/js/runtime-config.js /usr/share/nginx/html/js/runtime-config.js

EXPOSE 80
