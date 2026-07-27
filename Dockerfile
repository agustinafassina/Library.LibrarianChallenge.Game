FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY vendor/ /usr/share/nginx/html/vendor/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY data/ /usr/share/nginx/html/data/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80
