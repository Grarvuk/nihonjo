// Le serveur qu'appelle l'APPLICATION Android (plateforme.js). Sur le site,
// ce fichier ne sert pas : les appels y sont relatifs.
//
// creer_application_android.bat le réécrit dans la copie de l'application
// si la variable NIHONJO_SERVEUR est posée (une application d'essai qui
// parlerait à un autre serveur) ; sinon c'est celui-ci. Toujours en https :
// l'application refuse le trafic en clair.
export const SERVEUR_APPLICATION = 'https://nihonjo.odyvresse.com/';
