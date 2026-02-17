# Utilisation d'une version légère de Nginx sur Alpine Linux
FROM nginx:stable-alpine

# Nettoyage du répertoire par défaut de Nginx
RUN rm -rf /usr/share/nginx/html/*

# Copie de tous les fichiers du projet dans le container
# (HTML, CSS, JS, et tes fichiers data_cours.js, config.js, etc.)
COPY . /usr/share/nginx/html

# Exposition du port 80 (standard HTTP)
EXPOSE 80

# Lancement de Nginx
CMD ["nginx", "-g", "daemon off;"]