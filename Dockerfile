# Nihonjo en local : Apache + PHP (l'API est en PHP, la base en SQLite).
# Même pile que l'hébergement OVH, pour que ce qui marche ici marche là-bas.
FROM php:8.3-apache

# pdo_sqlite est déjà compilé dans l'image officielle : rien à installer.
# L'image php:apache lit les .htaccess (AllowOverride All, docker-php.conf) ;
# le .htaccess racine (mot de passe) est exclu par .dockerignore. On ferme en
# plus ici ce que data/.htaccess, api/lib/.htaccess et api/.htaccess ferment
# sur l'hébergement, au cas où l'un d'eux manquerait.
RUN { \
      echo '<Directory /var/www/html/data>'; echo '    Require all denied'; echo '</Directory>'; \
      echo '<Directory /var/www/html/api/lib>'; echo '    Require all denied'; echo '</Directory>'; \
      echo '<Directory /var/www/html/api>'; \
      echo '    <FilesMatch "^config(\.local)?\.php$">'; echo '        Require all denied'; echo '    </FilesMatch>'; \
      echo '</Directory>'; \
    } > /etc/apache2/conf-available/nihonjo.conf \
 && a2enmod headers \
 && echo 'Header set Cache-Control "no-cache"' >> /etc/apache2/conf-available/nihonjo.conf \
 && a2enconf nihonjo
# ⚠️ mod_headers n'est PAS actif dans php:apache : sans lui, le
# « Cache-Control: no-cache » d'assets/.htaccess est ignoré EN SILENCE (bloc
# <IfModule>), et le navigateur garde les anciens modules JS après une mise à
# jour — vécu le 25/10 : l'accueil restait à l'ancienne version même après
# relance et Ctrl+F5. Et le no-cache vaut pour TOUT (index.html compris, que
# l'assets/.htaccess ne couvre pas) : le navigateur revalide chaque fichier.

COPY . /var/www/html/

# ⚠️ PHP (www-data) doit pouvoir écrire DANS le dossier, pas seulement dans
# le fichier : SQLite y crée son journal à chaque écriture. Le volume nommé
# de docker-compose.yml reprend ce propriétaire à sa création.
RUN mkdir -p /var/www/html/data && chown -R www-data:www-data /var/www/html/data

EXPOSE 80
