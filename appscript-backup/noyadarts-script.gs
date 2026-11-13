/**
 * Noya'Darts : outils de saisie pour le Google Sheet du club.
 *
 * Remplace les anciennes macros Excel :
 *   - Ajouter_Record / MAJ_Records : fenêtre "Saisir une soirée" + formules automatiques dans l'onglet Records
 *   - Ajout de joueur : menu "Ajouter un joueur" (ou directement dans la fenêtre de saisie),
 *     avec alerte si un joueur au nom proche existe déjà (ex. "Alex" / "Alexandre")
 *   - Suppression de joueur : menu "Supprimer un joueur" (avec confirmation)
 *   - Changement de nom : menu "Renommer un joueur" (championnat, Records BD et onglet Records)
 *   - Sort_Poule_A / Sort_Poule_B : menu "Trier les poules"
 *
 * Tournoi du jeudi (menu "Lancer un tournoi") : tirage des poules, legs gagnants réglables par poule,
 * onglet "Tournoi" avec les matchs (menus déroulants des legs), classements calculés à chaque score,
 * arbre de la phase finale (demi-finales, petite finale, finale), puis "Valider le tournoi"
 * qui ouvre la saisie de la soirée avec le classement déjà rempli.
 *
 * Page web du tournoi (tournoi.html sur le site) : ce script sert aussi d'application Web (doGet / doPost),
 * protégée par le code du club (menu "Code du club (page web)"). Depuis la page : matchs de poule joués
 * dans n'importe quel ordre (« À suivre » annoncé à la main ou proposé), joueurs en pause,
 * affiches de la phase finale modifiables à la main.
 *
 * Contrôle du fichier (menu "Vérifier le fichier") : en-têtes, dates, noms et cohérence des onglets,
 * avec correction automatique des en-têtes. Soirée enregistrée par erreur : menu "Retirer une soirée".
 *
 * Résultats de tous les matchs archivés dans l'onglet "Matchs BD" à la validation de la soirée
 * (pour de futures statistiques).
 *
 * Photos du site depuis un dossier Google Drive (menu "Mettre à jour les photos"),
 * listées dans l'onglet "Photos", que le site lit (onglet publié en CSV).
 *
 * Installation : Extensions > Apps Script, coller ce fichier, enregistrer,
 * choisir la fonction "installer" puis cliquer sur Exécuter.
 */

const CFG = {
  champ: 'Darters Championship',
  bd: 'Records BD',
  rec: 'Records',
  params: 'Paramètres points championnat',
  photos: 'Photos',
  matchs: 'Matchs BD',
  siteUrl: 'https://noyadarts.github.io/noyadarts-site/',
  col1: 4, // colonne D : première soirée (Classement, Records, Points)
  habitues: 6, // semaines : au lancement d'un tournoi, les joueurs pas venus depuis plus longtemps sont repliés
};

const TYPES = [
  { nom: 'Moyenne Leg', min: 50, max: 167,
    tropBas: "On ne prend qu'au dessus de 50 MPR en record de moyenne / leg, en vrai tu n'as rien fait d'exceptionnel...",
    tropHaut: "Genre... Tu peux m'expliquer comment tu as pu faire plus que 150 de moyenne au 301 ou 167 au 501 ?!?!" },
  { nom: 'Meilleure Volée', min: 100, max: 180, parfait: 180,
    tropBas: "On ne prend qu'au dessus de 100 points en record de volée, en vrai tu n'as rien fait d'exceptionnel...",
    tropHaut: "Genre... Tu peux m'expliquer comment tu as pu faire plus que 180 en une seule volée ?!?!" },
  { nom: 'Meilleure Sortie', min: 60, max: 170, parfait: 170,
    tropBas: "On ne prend qu'au dessus de 60 points en record de sortie, en vrai tu n'as rien fait d'exceptionnel...",
    tropHaut: "Genre... Tu peux m'expliquer comment tu as pu faire une sortie à plus de 170 ?!?!" },
];
// Score parfait (180, et 170 en sortie : le « big fish ») : plusieurs joueurs peuvent le faire le même soir,
// et un joueur peut le faire plusieurs fois. Chaque score parfait est un record (1 point bonus chacun).

/** Noms des détenteurs d'un record, « Nico ×2, Bob » si plusieurs scores parfaits le même soir. */
function nomsRecord_(noms) {
  const ordre = [], nb = {};
  noms.forEach(function (n) { if (!nb[n]) { nb[n] = 0; ordre.push(n); } nb[n]++; });
  return ordre.map(function (n) { return n + (nb[n] > 1 ? ' ×' + nb[n] : ''); }).join(', ');
}

/**
 * Contrôle les records d'une soirée : [{ type, score, nom }] (lignes vides ignorées).
 * Un seul record par type, sauf les scores parfaits (180, 170) : autant de lignes que de scores parfaits.
 * estPresent(nom) dit si le joueur a joué ce soir-là.
 */
function validerRecords_(liste, estPresent) {
  const recs = [];
  (liste || []).forEach(function (r) {
    const brut = String(r.score === undefined || r.score === null ? '' : r.score).trim().replace(',', '.');
    if (!brut && !r.nom) return; // ligne vide : pas de record ce soir-là
    const t = TYPES.find(function (x) { return x.nom === r.type; });
    if (!t) throw new Error('Type de record inconnu : ' + r.type);
    if (!brut) throw new Error('Faudrait voir à remplir la valeur du record « ' + t.nom + ' », je ne suis pas devin...');
    if (!r.nom) throw new Error('Qui a fait le record « ' + t.nom + ' » ?');
    const v = Number(brut);
    if (isNaN(v)) throw new Error('« ' + r.score + ' » n\'est pas un nombre (' + t.nom + ').');
    if (v < t.min) throw new Error(t.tropBas);
    if (v > t.max) throw new Error(t.tropHaut);
    if (!estPresent(r.nom)) throw new Error(r.nom + " n'a pas joué ce soir-là, son record ne peut pas compter.");
    recs.push({ type: t.nom, score: v, nom: r.nom });
  });
  TYPES.forEach(function (t) {
    const l = recs.filter(function (r) { return r.type === t.nom; });
    if (l.length < 2) return;
    if (!t.parfait) throw new Error('Un seul record « ' + t.nom + ' » par soirée.');
    if (l.some(function (r) { return r.score !== t.parfait; })) {
      throw new Error('Plusieurs records « ' + t.nom + ' » le même soir : seulement pour des ' + t.parfait + ' (chacun compte).');
    }
  });
  return recs;
}

const RANGS = [
  { v: 1, l: 'Vainqueur' }, { v: 2, l: 'Finaliste' }, { v: 3, l: '3e' },
  { v: 4, l: '4e' }, { v: 5, l: 'Participation' },
];

// Soirée du 1er octobre 2026, reprise du fichier Excel (importée une seule fois par "installer")
const SOIREE_1ER_OCTOBRE = {
  date: '2026-10-01',
  rangs: { 'Guillaume': 1, 'Jerome': 2, 'Bob le fou': 3, 'Bast le Kid': 4, 'Nico': 5, 'Eddy': 5, 'Shido': 5 },
  records: [
    { type: 'Moyenne Leg', score: 64.5, nom: 'Bob le fou' },
    { type: 'Meilleure Volée', score: 140, nom: 'Guillaume' },
    { type: 'Meilleure Sortie', score: 80, nom: 'Guillaume' },
  ],
};

/* =========================== MENU =========================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("🎯 Noya'Darts")
    .addItem('Saisir une soirée', 'ouvrirSaisie')
    .addItem('Retirer une soirée', 'retirerSoiree')
    .addItem('Ajouter un joueur', 'menuAjouterJoueur')
    .addItem('Renommer un joueur', 'ouvrirRenommage')
    .addItem('Supprimer un joueur', 'ouvrirSuppression')
    .addSeparator()
    .addItem('Lancer un tournoi', 'ouvrirTournoi')
    .addItem('Mettre à jour le tournoi', 'majTournoi')
    .addItem('Valider le tournoi', 'validerTournoi')
    .addItem('Réglages du tournoi', 'reglagesTournoi')
    .addItem('Code du club (page web)', 'definirCode')
    .addSeparator()
    .addItem('Trier les poules (onglet affiché)', 'trierPoules')
    .addSeparator()
    .addItem('Mettre à jour les photos', 'majPhotos')
    .addItem('Changer le dossier photos', 'choisirDossierPhotos')
    .addItem('Voir le site', 'ouvrirSite')
    .addSeparator()
    .addItem('Vérifier le fichier', 'verifierFichier')
    .addItem('Réparer le fichier', 'installer')
    .addToUi();
}

function ouvrirSaisie() {
  const html = HtmlService.createHtmlOutput(HTML_SAISIE).setWidth(660).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, "Saisie d'une soirée");
}

function menuAjouterJoueur() {
  const ui = SpreadsheetApp.getUi();
  const rep = ui.prompt('Ajouter un joueur', 'Nom du joueur :', ui.ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui.Button.OK) return;
  try {
    let res = ajouterJoueur(rep.getResponseText(), false);
    if (!res.ajoute) {
      const ok = ui.alert('Joueur déjà inscrit ?',
        '« ' + res.nom + ' » ressemble à : ' + res.proches.join(', ') + '.\n\n' +
        'Est-ce bien un nouveau joueur ?', ui.ButtonSet.YES_NO);
      if (ok !== ui.Button.YES) return;
      res = ajouterJoueur(res.nom, true);
    }
    ui.alert('« ' + res.nom + ' » est ajouté au championnat.');
  } catch (e) {
    ui.alert(e.message);
  }
}

function ouvrirRenommage() {
  const html = HtmlService.createHtmlOutput(HTML_RENOMMAGE).setWidth(460).setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'Renommer un joueur');
}

function ouvrirSuppression() {
  const html = HtmlService.createHtmlOutput(HTML_SUPPRESSION).setWidth(460).setHeight(340);
  SpreadsheetApp.getUi().showModalDialog(html, 'Supprimer un joueur');
}

function ouvrirSite() {
  const html = HtmlService.createHtmlOutput(
    '<p style="font-family:Arial">Ouverture du site... Si rien ne se passe : ' +
    '<a href="' + CFG.siteUrl + '" target="_blank">clique ici</a>.</p>' +
    '<script>window.open("' + CFG.siteUrl + '","_blank");setTimeout(function(){google.script.host.close();},1500);</script>'
  ).setWidth(320).setHeight(90);
  SpreadsheetApp.getUi().showModalDialog(html, "Site Noya'Darts");
}

/* ======================== INSTALLATION ======================== */

function installer() {
  const ss = ss_();
  [CFG.champ, CFG.bd, CFG.rec, CFG.params].forEach(feuille_); // vérifie que les onglets existent

  supprimerAnciensBoutons_();
  refreshFormules_(feuille_(CFG.champ)); // recalcule tous les points et totaux
  installerOngletRecords_();            // recalcule l'onglet Records

  let msg = "Le fichier est prêt.\n\n";
  const dejaRecords = lireRecordsBD_().some(function (l) { return l.cle === SOIREE_1ER_OCTOBRE.date; });
  const retiree = PropertiesService.getDocumentProperties().getProperty('soiree1erOctobreRetiree'); // retirée exprès : ne pas la réimporter
  if (!retiree && (!colonneSoiree_(feuille_(CFG.champ), SOIREE_1ER_OCTOBRE.date, false) || !dejaRecords)) {
    enregistrerSoiree(SOIREE_1ER_OCTOBRE);
    msg += "La soirée du 1er octobre (et le joueur Jerome) a été ajoutée.\n\n";
  }
  onOpen();
  msg += "Utilise désormais le menu « 🎯 Noya'Darts » en haut de l'écran.";
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  ss.toast("Installation terminée", "Noya'Darts", 5);
}

function supprimerAnciensBoutons_() {
  ss_().getSheets().forEach(function (sh) {
    try {
      sh.getDrawings().forEach(function (d) {
        if (/Ajouter_Record|Bouton5_Cliquer|Sort_Poule/i.test(d.getOnAction() || '')) d.remove();
      });
    } catch (e) { /* rien à faire */ }
  });
}

/**
 * Onglet Records : recalculé par le script à partir de "Records BD" (valeurs, pas de formules).
 * Mis à jour à chaque enregistrement de soirée, suppression de joueur et "Réparer le fichier".
 * Même disposition qu'avant : dernière soirée (A3:C6), 5 dernières soirées (A10 à C33),
 * et à droite records du club (G4), de la saison (G11) et des 5 dernières soirées (G18).
 */
function installerOngletRecords_() {
  const sh = feuille_(CFG.rec);
  const tz = ss_().getSpreadsheetTimeZone();
  const recs = lireRecordsBD_();
  const dates = recs.map(function (l) { return l.cle; })
    .filter(function (d, i, a) { return d && a.indexOf(d) === i; })
    .sort().reverse(); // de la plus récente à la plus ancienne

  // Record d'un type pour une soirée (scores parfaits : tous les détenteurs, « Nico ×2, Bob »)
  const regrouper = function (l) {
    return l.length ? { cle: l[0].cle, score: l[0].score, nom: nomsRecord_(l.map(function (x) { return x.nom; })) } : undefined;
  };
  const duSoir = function (iso, type) {
    const l = recs.filter(function (x) { return x.cle === iso && x.type === type; });
    return regrouper(l.filter(function (x) { return Number(x.score) === Number(l[0] && l[0].score); }));
  };
  // Meilleur record d'un type sur une période ; à égalité, le plus récent l'emporte
  // (et tous ses détenteurs de ce soir-là s'il s'agit de scores parfaits)
  const meilleur = function (type, depuis) {
    const l = recs.filter(function (x) { return x.type === type && (!depuis || x.cle >= depuis); })
      .sort(function (a, b) { return (Number(b.score) || 0) - (Number(a.score) || 0) || (a.cle < b.cle ? 1 : a.cle > b.cle ? -1 : 0); });
    return regrouper(l.filter(function (x) { return l.length && x.cle === l[0].cle && Number(x.score) === Number(l[0].score); }));
  };
  const blocSoiree = function (ligneDate, iso) {
    sh.getRange(ligneDate, 1).setValue(iso ? serie_(iso) : '').setNumberFormat('d/m/yyyy');
    sh.getRange(ligneDate + 1, 1, 3, 3).clearDataValidations().setValues(TYPES.map(function (t) {
      const r = iso ? duSoir(iso, t.nom) : null;
      return [t.nom, r ? r.score : '', r ? r.nom : ''];
    }));
  };

  // Bloc de gauche : dernière soirée, puis les 5 dernières soirées
  sh.getRange('A1').setValue('Dernière soirée');
  blocSoiree(3, dates[0]);
  for (let k = 1; k <= 5; k++) {
    const r0 = 5 + 5 * k; // 10, 15, 20, 25, 30
    sh.getRange(r0, 2, 1, 2).setValues([['Combien ', 'Qui']]);
    blocSoiree(r0, dates[k - 1]);
  }

  // Bloc de droite : club, saison (1er juillet au 30 juin), 5 dernières soirées
  const an = Number(Utilities.formatDate(new Date(), tz, 'yyyy'));
  const mois = Number(Utilities.formatDate(new Date(), tz, 'M'));
  const debutSaison = mois < 7 ? an - 1 : an;
  sh.getRange('G8').setValue('Saison ' + debutSaison + '-' + (debutSaison + 1));
  sh.getRange('G15').setValue('5 dernières soirées');
  const blocs = [
    { ligne: 4, depuis: '' },
    { ligne: 11, depuis: debutSaison + '-07-01' },
    { ligne: 18, depuis: dates.length ? dates[Math.min(4, dates.length - 1)] : '' },
  ];
  blocs.forEach(function (b) {
    sh.getRange(b.ligne, 7, 3, 4).setValues(TYPES.map(function (t) {
      const r = meilleur(t.nom, b.depuis);
      return r ? [t.nom, r.score, r.nom, serie_(r.cle)] : [t.nom, 'Pas de record', '', ''];
    }));
    sh.getRange(b.ligne, 10, 3, 1).setNumberFormat('d/m/yyyy');
  });
}

/* ================== FONCTIONS APPELÉES PAR LA FENÊTRE ================== */

function donneesSaisie() {
  return {
    joueurs: lireJoueurs_(),
    types: TYPES.map(function (t) { return { nom: t.nom, min: t.min, max: t.max, parfait: t.parfait || null }; }),
    rangs: RANGS,
    dateDefaut: dernierJeudi_(),
  };
}

/** Renvoie ce qui est déjà enregistré pour une date (pour corriger une soirée). */
function chargerSoiree(iso) {
  const sh = feuille_(CFG.champ);
  const res = { existe: false, rangs: {}, records: [], ecarts: [] };
  const recsChamp = {};
  const info = colonneSoiree_(sh, iso, false);
  if (info) {
    res.existe = true;
    const last = derniereLigneJoueur_(sh);
    if (last >= 3) {
      const noms = sh.getRange(3, 1, last - 2, 1).getValues();
      const vals = sh.getRange(3, info.col, last - 2, 2).getValues();
      noms.forEach(function (n, i) {
        const nom = String(n[0]).trim();
        if (vals[i][0] !== '' && vals[i][0] !== null) res.rangs[nom] = Number(vals[i][0]);
        if (Number(vals[i][1]) > 0) recsChamp[nom] = Number(vals[i][1]);
      });
    }
  }
  lireRecordsBD_().forEach(function (l) {
    if (l.cle === iso) res.records.push({ type: l.type, score: l.score, nom: l.nom });
  });
  // Signale les incohérences entre la colonne "Records" du championnat et "Records BD"
  Object.keys(recsChamp).forEach(function (nom) {
    const nbBD = res.records.filter(function (r) { return r.nom === nom; }).length;
    if (nbBD !== recsChamp[nom]) {
      res.ecarts.push(nom + ' a ' + recsChamp[nom] + ' record(s) au championnat mais ' + nbBD + ' dans « Records BD »');
    }
  });
  return res;
}

/**
 * Ajoute un joueur.
 * Si un joueur au nom proche existe (et que forcer est faux), n'ajoute rien et renvoie
 * { nom, ajoute: false, proches: [...] } pour demander confirmation.
 * Sinon renvoie { nom, ajoute: true }.
 */
function ajouterJoueur(nom, forcer) {
  invaliderEtat_();
  nom = String(nom || '').trim().replace(/\s+/g, ' ');
  if (!nom) throw new Error("T'es bidon mec, il faut taper le nom avant de valider...");
  const sh = feuille_(CFG.champ);
  const joueurs = lireJoueurs_();
  // Même nom aux accents, majuscules, espaces et ponctuation près ("Jérôme" = "jerome")
  const existe = joueurs.find(function (j) { return cleNom_(j) === cleNom_(nom); });
  if (existe) throw new Error('Le darter « ' + existe + ' » existe déjà, tu croyais être original ?! Raté.');
  if (!forcer) {
    const proches = joueursProches_(nom, joueurs);
    if (proches.length) return { nom: nom, ajoute: false, proches: proches };
  }
  const r = derniereLigneJoueur_(sh) + 1;
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 10);
  sh.getRange(r, 1).setValue(nom);
  refreshFormules_(sh);
  return { nom: nom, ajoute: true };
}

/** Liste des joueurs (pour la fenêtre de suppression). */
function listeJoueurs() { return lireJoueurs_(); }

/** Ce qui sera perdu si on supprime ce joueur. */
function infosJoueur(nom) {
  const sh = feuille_(CFG.champ);
  const r = ligneJoueur_(sh, nom);
  if (!r) throw new Error('Joueur introuvable : « ' + nom + ' ».');
  const lastCol = sh.getLastColumn();
  const ligne = sh.getRange(r, 1, 1, lastCol).getValues()[0];
  let soirees = 0;
  for (let c = CFG.col1; c <= lastCol; c += 3) {
    if (ligne[c - 1] !== '' && ligne[c - 1] !== null) soirees++;
  }
  const records = lireRecordsBD_().filter(function (l) { return l.nom === nom; }).length;
  return { nom: nom, soirees: soirees, points: Number(ligne[1]) || 0, records: records };
}

/**
 * Renomme un joueur : son nom dans le championnat (ses résultats restent sur sa ligne),
 * dans "Records BD", puis l'onglet "Records" est recalculé. Les onglets de poules ne sont pas modifiés.
 * Refusé si le nouveau nom est celui d'un autre joueur (accents, majuscules, espaces et ponctuation près).
 * Si un autre joueur a un nom proche (et que forcer est faux), ne change rien et renvoie
 * { nom, renomme: false, proches: [...] } pour demander confirmation.
 * Sinon renvoie { nom, renomme: true, message }.
 */
function renommerJoueur(ancien, nouveau, forcer) {
  invaliderEtat_();
  ancien = String(ancien || '').trim();
  nouveau = String(nouveau || '').trim().replace(/\s+/g, ' ');
  if (!ancien) throw new Error('Choisis le joueur à renommer.');
  if (!nouveau) throw new Error("T'es bidon mec, il faut taper le nouveau nom avant de valider...");
  if (nouveau === ancien) throw new Error("C'est déjà son nom, il n'y a rien à changer.");
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const sh = feuille_(CFG.champ);
    const r = ligneJoueur_(sh, ancien);
    if (!r) throw new Error('Joueur introuvable : « ' + ancien + ' ». Il a peut-être déjà été renommé.');
    // Les autres joueurs (changer seulement un accent ou une majuscule de son propre nom est permis)
    const autres = lireJoueurs_().filter(function (j) { return j !== ancien; });
    const existe = autres.find(function (j) { return cleNom_(j) === cleNom_(nouveau); });
    if (existe) {
      throw new Error('Le darter « ' + existe + ' » existe déjà. Si c\'est la même personne, ' +
        'reporte ses résultats sur un seul joueur (menu Saisir une soirée), puis supprime l\'autre.');
    }
    if (!forcer) {
      const proches = joueursProches_(nouveau, autres);
      if (proches.length) return { nom: nouveau, renomme: false, proches: proches };
    }

    // Championnat : seul le nom change, les résultats restent sur la même ligne
    sh.getRange(r, 1).setValue(nouveau);

    // Records BD : colonne Nom (D) uniquement, le reste n'est pas touché
    const bd = feuille_(CFG.bd);
    const lastBD = bd.getLastRow();
    let nbRecords = 0;
    if (lastBD >= 2) {
      const rg = bd.getRange(2, 4, lastBD - 1, 1);
      const noms = rg.getValues();
      noms.forEach(function (l) {
        if (String(l[0]).trim() === ancien) { l[0] = nouveau; nbRecords++; }
      });
      if (nbRecords) rg.setValues(noms);
    }

    // Matchs BD : colonnes Joueur 1 (C), Joueur 2 (E) et Vainqueur (H)
    const mbd = ss_().getSheetByName(CFG.matchs);
    if (mbd && mbd.getLastRow() >= 2) {
      const rgM = mbd.getRange(2, 1, mbd.getLastRow() - 1, 8);
      const vals = rgM.getValues();
      let change = false;
      vals.forEach(function (l) {
        [2, 4, 7].forEach(function (j) { if (String(l[j]).trim() === ancien) { l[j] = nouveau; change = true; } });
      });
      if (change) {
        [2, 4, 7].forEach(function (j) {
          mbd.getRange(2, j + 1, vals.length, 1).setValues(vals.map(function (l) { return [l[j]]; }));
        });
      }
    }

    installerOngletRecords_();
    try { renommerDansTournoi_(ancien, nouveau); } catch (e) { /* le tournoi en cours n'empêche pas le changement de nom */ }
    SpreadsheetApp.flush();
    return { nom: nouveau, renomme: true,
      message: '« ' + ancien + ' » s\'appelle désormais « ' + nouveau + ' » (' + nbRecords +
        ' record(s) mis à jour). Le site sera à jour d\'ici 5 minutes.' };
  } finally {
    lock.releaseLock();
  }
}

/** Supprime un joueur : sa ligne du championnat et ses records dans "Records BD". */
function supprimerJoueur(nom) {
  invaliderEtat_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const sh = feuille_(CFG.champ);
    const r = ligneJoueur_(sh, nom);
    if (!r) throw new Error('Joueur introuvable : « ' + nom + ' ». Il a peut-être déjà été supprimé.');
    const info = infosJoueur(nom);
    sh.deleteRow(r);
    if (info.records) {
      ecrireLignesBD_(lireRecordsBD_()
        .filter(function (l) { return l.nom !== nom; })
        .map(function (l) { return [serie_(l.cle), l.type, l.score, l.nom]; }));
    }
    refreshFormules_(sh);
    installerOngletRecords_();
    SpreadsheetApp.flush();
    return '« ' + nom + ' » a été supprimé (' + info.soirees + ' soirée(s), ' + info.records +
      ' record(s) retiré(s)). Le site sera à jour d\'ici 5 minutes.';
  } finally {
    lock.releaseLock();
  }
}

/**
 * Enregistre (ou corrige) une soirée.
 * p = { date: 'aaaa-mm-jj', rangs: { nom: 1..5 }, records: [{ type, score, nom }] }
 */
function enregistrerSoiree(p) {
  invaliderEtat_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new Error('Choisis la date de la soirée.');
    const rangs = {};
    Object.keys(p.rangs || {}).forEach(function (n) { if (p.rangs[n]) rangs[n] = Number(p.rangs[n]); });
    const presents = Object.keys(rangs);
    if (presents.length < 3) throw new Error("Il faut au moins 3 darters pour faire un tournoi blaireau, sinon ça s'appelle un match...");
    const nb = function (v) { return presents.filter(function (n) { return rangs[n] === v; }).length; };
    if (nb(1) !== 1) throw new Error('Il faut un vainqueur, et un seul.');
    if (nb(2) !== 1) throw new Error('Il faut un finaliste, et un seul.');

    const recs = validerRecords_(p.records, function (n) { return !!rangs[n]; });

    const sh = feuille_(CFG.champ);
    const joueurs = lireJoueurs_();
    presents.forEach(function (n) { if (joueurs.indexOf(n) < 0) ajouterJoueur(n, true); });

    // Championnat : classement + nombre de records de chaque joueur
    const col = colonneSoiree_(sh, p.date, true).col;
    const last = derniereLigneJoueur_(sh);
    const noms = sh.getRange(3, 1, last - 2, 1).getValues().map(function (r) { return String(r[0]).trim(); });
    const data = noms.map(function (n) {
      const rg = rangs[n] || '';
      const nr = recs.filter(function (r) { return r.nom === n; }).length;
      return [rg, rg && nr ? nr : ''];
    });
    sh.getRange(3, col, noms.length, 2).setValues(data);

    // Records BD
    ecrireRecordsBD_(p.date, recs);

    // Matchs BD : résultats de tous les matchs du tournoi de cette date (s'il est dans l'onglet « Tournoi »)
    let nbMatchs = null, erreurMatchs = '';
    try { nbMatchs = archiverMatchs_(p.date); } catch (e) { erreurMatchs = e.message; }

    // Tri du championnat par points (puis formules remises au propre)
    refreshFormules_(sh);
    SpreadsheetApp.flush();
    sh.getRange(3, 1, noms.length, sh.getLastColumn())
      .sort([{ column: 2, ascending: false }, { column: 1, ascending: true }]);
    refreshFormules_(sh);
    installerOngletRecords_();
    SpreadsheetApp.flush();

    const d = p.date.split('-');
    return 'Soirée du ' + Number(d[2]) + '/' + Number(d[1]) + '/' + d[0] + ' enregistrée : ' +
      presents.length + ' joueurs, ' + recs.length + ' record(s)' +
      (nbMatchs !== null ? ', ' + nbMatchs + ' match(s) archivé(s) dans « ' + CFG.matchs + ' »' : '') +
      '. Le site sera à jour d\'ici 5 minutes.' +
      (erreurMatchs ? ' Attention, matchs non archivés : ' + erreurMatchs : '');
  } finally {
    lock.releaseLock();
  }
}

/* ============================ POULES ============================ */

function trierPoules() {
  const sh = SpreadsheetApp.getActiveSheet();
  const n = sh.getName();
  if (n === '1 Poule') {
    trierBlocPoule_(sh, 'B4:E9');
  } else if (n === '2 Poules') {
    trierBlocPoule_(sh, 'B4:E9');
    trierBlocPoule_(sh, 'G4:J9');
  } else {
    SpreadsheetApp.getUi().alert("Affiche d'abord l'onglet « 1 Poule » ou « 2 Poules » " +
      "(s'ils sont masqués : clic sur l'icône ☰ en bas à gauche, puis sur le nom de l'onglet).");
    return;
  }
  ss_().toast('Poules triées (victoires, puis legs)', "Noya'Darts", 3);
}

/** Trie par victoires puis legs, en ne réécrivant que les noms (les formules restent intactes). */
function trierBlocPoule_(sh, a1) {
  const rg = sh.getRange(a1);
  const v = rg.getValues().filter(function (r) { return String(r[0]).trim() !== ''; });
  v.sort(function (a, b) { return (Number(b[2]) || 0) - (Number(a[2]) || 0) || (Number(b[3]) || 0) - (Number(a[3]) || 0); });
  const noms = v.map(function (r) { return [r[0]]; });
  while (noms.length < rg.getNumRows()) noms.push(['']);
  sh.getRange(rg.getRow(), rg.getColumn(), noms.length, 1).setValues(noms);
}

/* ============================ TOURNOI ============================ */
/*
 * Tournoi du jeudi : poules (chacun contre chacun), puis demi-finales, petite finale et finale.
 * Option « Grosse soirée » (3 poules) : les 2 premiers de chaque poule sont qualifiés (6 joueurs).
 * Les deux meilleurs 1ers vont directement en demi-finale, les quatre autres jouent les quarts.
 * L'état du tournoi (date et composition des poules) est rangé dans l'onglet « Tournoi » lui-même
 * (métadonnée invisible) : la mise à jour automatique à chaque score tapé fonctionne sans autorisation
 * supplémentaire. Le moteur (planTournoi_, calculTournoi_...) ne dépend pas du Google Sheet :
 * il servira aussi à la future page web du site.
 */

const TOURNOI = {
  onglet: 'Tournoi',
  meta: 'noyadarts-tournoi',
  legs: 2,          // legs gagnants par défaut (chaque poule et la phase finale ont leur propre réglage)
  legsMax: 5,
  seuil2: 7,        // valeurs par défaut, modifiables par le menu « Réglages du tournoi »
  seuil3: 13,
  lettres: 'ABC',
  colD: 9,          // colonne I : début du bloc de droite (classements et phase finale)
};

const LIBELLES_FINALE = { Q1: 'Quart de finale 1', Q2: 'Quart de finale 2', D1: 'Demi-finale 1', D2: 'Demi-finale 2', PF: 'Petite finale', F: 'Finale' };

/** Grosse soirée : 6 qualifiés et quarts de finale (seulement avec 3 poules). */
function estGrosse_(etat) { return !!etat.grosse && etat.poules.length === 3; }

/* ---------- Menu ---------- */

function ouvrirTournoi() {
  const html = HtmlService.createHtmlOutput(HTML_TOURNOI).setWidth(640).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Lancer un tournoi');
}

function majTournoi() {
  try {
    const r = majTournoi_();
    ss_().toast(r.statut, "Noya'Darts", 5);
  } catch (e) {
    SpreadsheetApp.getUi().alert(e.message);
  }
}

/** Ouvre la fenêtre « Saisir une soirée » avec le classement du tournoi déjà rempli. */
function validerTournoi() {
  const ui = SpreadsheetApp.getUi();
  let r;
  try { r = majTournoi_(); } catch (e) { ui.alert(e.message); return; }
  if (!r.rangs) {
    ui.alert("Le tournoi n'est pas terminé : il manque le score de la finale" +
      (r.avecPetiteFinale ? ' ou de la petite finale' : '') + '.');
    return;
  }
  const pre = JSON.stringify({ date: r.date, rangs: r.rangs, records: (lireEtatTournoi_() || {}).records || [] }).replace(/</g, '\\u003c');
  const html = HtmlService.createHtmlOutput(
    HTML_SAISIE.replace('var DEPUIS_TOURNOI = null;', 'var DEPUIS_TOURNOI = ' + pre + ';')
  ).setWidth(660).setHeight(720);
  ui.showModalDialog(html, "Saisie d'une soirée");
}

function reglagesTournoi() {
  const ui = SpreadsheetApp.getUi();
  const s = seuilsTournoi_();
  const r2 = ui.prompt('Réglages du tournoi (1/2)',
    'À partir de combien de joueurs passe-t-on à 2 poules ? (actuellement ' + s.seuil2 + ')\n' +
    'Laisse vide pour ne rien changer.', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const r3 = ui.prompt('Réglages du tournoi (2/2)',
    'À partir de combien de joueurs passe-t-on à 3 poules ? (actuellement ' + s.seuil3 + ')\n' +
    'Laisse vide pour ne rien changer.', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  const lire = function (t, defaut) { t = String(t || '').trim(); return t ? Number(t) : defaut; };
  const n2 = lire(r2.getResponseText(), s.seuil2), n3 = lire(r3.getResponseText(), s.seuil3);
  try { enregistrerSeuils_(n2, n3); } catch (e) { ui.alert(e.message); return; }
  ui.alert('Réglages enregistrés : 1 poule jusqu\'à ' + (n2 - 1) + ' joueurs, 2 poules de ' + n2 + ' à ' + (n3 - 1) +
    ', 3 poules à partir de ' + n3 + '. Tu pourras toujours choisir un autre nombre de poules au lancement.');
}

function enregistrerSeuils_(n2, n3) {
  invaliderEtat_();
  n2 = Number(n2); n3 = Number(n3);
  if (!Number.isInteger(n2) || n2 < 4) throw new Error('Pour 2 poules, il faut un nombre entier, au moins 4 (2 joueurs par poule).');
  if (!Number.isInteger(n3) || n3 < 6 || n3 <= n2) throw new Error('Pour 3 poules, il faut un nombre entier, au moins 6 et plus grand que le réglage des 2 poules (' + n2 + ').');
  PropertiesService.getDocumentProperties().setProperties({ seuil2Poules: String(n2), seuil3Poules: String(n3) });
}

function seuilsTournoi_() {
  const p = PropertiesService.getDocumentProperties();
  return {
    seuil2: Number(p.getProperty('seuil2Poules')) || TOURNOI.seuil2,
    seuil3: Number(p.getProperty('seuil3Poules')) || TOURNOI.seuil3,
  };
}

/** Legs gagnants d'une poule et de la phase finale (2 par défaut pour les tournois lancés avant ce réglage). */
function legsPoule_(etat, p) { return (etat.legs && Number(etat.legs[p])) || TOURNOI.legs; }
/**
 * Legs gagnants d'un match de phase finale. Réglables phase par phase en cours de soirée
 * (etat.legsPhases = { Q: quarts, D: demi-finales, PF: petite finale, F: finale }), sinon le réglage du lancement.
 */
function phaseFinale_(id) { return /^Q/.test(id) ? 'Q' : /^D/.test(id) ? 'D' : id; }
function legsFinale_(etat, id) {
  const lp = etat.legsPhases || {};
  return (id && Number(lp[phaseFinale_(id)])) || Number(etat.legsFinale) || TOURNOI.legs;
}
const LIBELLES_PHASES = { Q: 'Quarts de finale', D: 'Demi-finales', PF: 'Petite finale', F: 'Finale' };

/**
 * Change les legs gagnants d'une phase finale en cours de soirée : req = { phase: 'Q'|'D'|'PF'|'F', legs }.
 * Refusé si un match de cette phase a déjà un score (l'effacer d'abord).
 */
function legsPhase_(req) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const lu = lireTournoi_();
    const ph = String(req.phase || '');
    const ids = lu.plan.finale.matchs.map(function (m) { return m.id; }).filter(function (id) { return phaseFinale_(id) === ph; });
    if (!ids.length) throw new Error('Phase introuvable dans ce tournoi.');
    const n = Number(req.legs);
    if (!Number.isInteger(n) || n < 1 || n > TOURNOI.legsMax) throw new Error('Legs gagnants : un nombre de 1 à ' + TOURNOI.legsMax + '.');
    const vide = function (v) { return v === '' || v === null || v === undefined; };
    lu.plan.finale.matchs.forEach(function (m, i) {
      const c = lu.cells[i];
      if (ids.indexOf(m.id) >= 0 && !(vide(c.a) && vide(c.b))) {
        throw new Error('Le match « ' + LIBELLES_FINALE[m.id] + ' » a déjà un score : efface-le d\'abord pour changer les legs.');
      }
    });
    const etat = lu.etat;
    etat.legsPhases = etat.legsPhases || {};
    etat.legsPhases[ph] = n;
    ecrireEtatTournoi_(etat);
    menusFinale_(lu.sh, etat, lu.plan);
    majTournoi_(lu); // recalcule avec les nouveaux legs, sans relire l'onglet
    return LIBELLES_PHASES[ph] + ' en ' + n + ' leg' + (n > 1 ? 's' : '') + ' gagnant' + (n > 1 ? 's' : '') + '.';
  } finally {
    lock.releaseLock();
  }
}

/** Titre de la phase finale, libellé et legs de chaque match (legs indiqués quand ils diffèrent d'un match à l'autre). */
function infosFinale_(etat, plan) {
  const txt = function (n) { return n + ' leg' + (n > 1 ? 's' : '') + ' gagnant' + (n > 1 ? 's' : ''); };
  const legs = plan.finale.matchs.map(function (m) { return legsFinale_(etat, m.id); });
  const pareil = legs.every(function (n) { return n === legs[0]; });
  return {
    titre: 'Phase finale (' + (pareil ? txt(legs[0]) : 'legs gagnants par match') + ')',
    legs: legs,
    libelles: plan.finale.matchs.map(function (m, i) { return LIBELLES_FINALE[m.id] + (pareil ? '' : ' (' + legs[i] + ')'); }),
  };
}
/** Menu déroulant des legs gagnés (0 à n). */
function menuLegs_(n) {
  const choix = [];
  for (let k = 0; k <= n; k++) choix.push(String(k));
  return SpreadsheetApp.newDataValidation().requireValueInList(choix, true).setAllowInvalid(false)
    .setHelpText('Legs gagnés par ce joueur (' + n + ' leg' + (n > 1 ? 's' : '') + ' gagnant' + (n > 1 ? 's' : '') + ')').build();
}

/** Menus des legs et titres de la phase finale dans l'onglet « Tournoi » (après un changement de legs en cours de soirée). */
function menusFinale_(sh, etat, plan) {
  const inf = infosFinale_(etat, plan);
  sh.getRange(plan.finale.titre, TOURNOI.colD).setValue(inf.titre);
  plan.finale.matchs.forEach(function (m, i) {
    sh.getRange(m.r1, m.col + 2, 2, 1).setDataValidation(menuLegs_(inf.legs[i]));
  });
}

/** Mise à jour automatique : chaque modification dans l'onglet « Tournoi » recalcule tout. */
function onEdit(e) {
  try {
    invaliderEtat_(); // toute saisie dans le Google Sheet peut changer ce qu'affiche la page
    if (!e || !e.range || e.range.getSheet().getName() !== TOURNOI.onglet) return;
    majTournoi_();
  } catch (err) { /* silencieux : le menu « Mettre à jour le tournoi » affiche l'erreur */ }
}

/* ---------- Fonctions appelées par la fenêtre « Lancer un tournoi » ---------- */

function donneesTournoi() {
  const s = seuilsTournoi_();
  const etat = lireEtatTournoi_();
  return { joueurs: lireJoueurs_(), venues: dernieresVenues_(), habitues: CFG.habitues,
    date: prochainJeudi_(), seuil2: s.seuil2, seuil3: s.seuil3, enCours: etat ? etat.date : null };
}

/**
 * Crée l'onglet « Tournoi » à partir des poules choisies : p = { date, poules: [[noms], ...], remplacer }.
 * Si un tournoi est déjà dans l'onglet et que remplacer est faux, renvoie { confirmer: message } sans rien changer.
 */
function lancerTournoi(p) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new Error('Choisis la date du tournoi.');
    const poules = (p.poules || []).map(function (l) { return l.map(function (n) { return String(n).trim(); }).filter(String); })
      .filter(function (l) { return l.length; });
    verifierPoules_(poules, lireJoueurs_());

    const ancien = lireEtatTournoi_();
    if (ancien && !p.remplacer) {
      const enregistre = !!colonneSoiree_(feuille_(CFG.champ), ancien.date, false);
      return { confirmer: "L'onglet « Tournoi » contient déjà le tournoi du " + dateFr_(ancien.date) +
        (enregistre ? ' (soirée enregistrée au championnat).' : ", qui n'est pas encore enregistré au championnat.") +
        ' Le remplacer par le nouveau ?' };
    }
    const okLegs = function (v) { v = Number(v); return Number.isInteger(v) && v >= 1 && v <= TOURNOI.legsMax; };
    const legs = poules.map(function (l, i) { return p.legs && p.legs[i] !== undefined ? Number(p.legs[i]) : TOURNOI.legs; });
    const legsFinale = p.legsFinale !== undefined ? Number(p.legsFinale) : TOURNOI.legs;
    if (!legs.every(okLegs) || !okLegs(legsFinale)) throw new Error('Legs gagnants : un nombre de 1 à ' + TOURNOI.legsMax + '.');
    const etat = { date: p.date, poules: poules, legs: legs, legsFinale: legsFinale };
    if (p.grosse && poules.length === 3) etat.grosse = true;
    ecrireTournoi_(etat);
    const n = poules.reduce(function (t, l) { return t + l.length; }, 0);
    return { message: 'Tournoi lancé : ' + n + ' joueurs, ' + poules.length + ' poule(s), ' +
      planTournoi_(etat).matchs.length + ' matchs de poule' +
      (etat.grosse ? ', grosse soirée (6 qualifiés, quarts de finale)' : '') + '. Bon jeu !' };
  } finally {
    lock.releaseLock();
  }
}

function verifierPoules_(poules, joueurs) {
  if (!poules.length || poules.length > 3) throw new Error('Il faut 1, 2 ou 3 poules.');
  const tous = [].concat.apply([], poules);
  if (tous.length < 3) throw new Error("Il faut au moins 3 darters pour faire un tournoi blaireau, sinon ça s'appelle un match...");
  tous.forEach(function (n, i) {
    if (tous.indexOf(n) !== i) throw new Error('« ' + n + ' » est dans deux poules.');
    if (joueurs && joueurs.indexOf(n) < 0) throw new Error('« ' + n + " » n'est pas dans le championnat : ajoute-le d'abord.");
  });
  if (poules.length > 1 && poules.some(function (l) { return l.length < 2; })) {
    throw new Error('Avec plusieurs poules, il faut au moins 2 joueurs par poule (les 2 premiers sont qualifiés).');
  }
}

/* ---------- Moteur (sans Google Sheet) ---------- */

/** Ordre des matchs d'une poule (méthode du cercle : chacun se repose entre deux matchs autant que possible). */
function roundRobin_(noms) {
  const l = noms.slice();
  if (l.length % 2) l.push(null);
  const m = l.length, res = [];
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = l[i], b = l[m - 1 - i];
      if (a !== null && b !== null) res.push(r % 2 ? [b, a] : [a, b]);
    }
    l.splice(1, 0, l.pop());
  }
  return res;
}

/**
 * Disposition de l'onglet. À gauche (A:G) : les matchs de poule, à partir de la ligne 5.
 * À droite (I:Q) : un classement par poule, puis la phase finale et le classement de la soirée.
 */
function planTournoi_(etat) {
  const P = etat.poules;
  const n = P.reduce(function (t, l) { return t + l.length; }, 0);
  const matchs = [];
  let r = 5;
  P.forEach(function (noms, p) {
    roundRobin_(noms).forEach(function (m, i) { matchs.push({ poule: p, num: i + 1, j1: m[0], j2: m[1], row: r++ }); });
  });
  const blocs = [];
  let q = 4;
  P.forEach(function (noms, p) {
    blocs.push({ poule: p, titre: q, entete: q + 1, debut: q + 2, n: noms.length });
    q += noms.length + 3;
  });
  // Phase finale en arbre : chaque match occupe une ligne de titre puis une ligne par joueur
  // (nom sur 2 colonnes fusionnées, puis le menu des legs). Demi-finales en I:K, finale en M:O,
  // reliées par des traits dans la colonne L ; petite finale sous la demi-finale 2.
  const C = TOURNOI.colD;
  const m = function (id, ligne, col) { return { id: id, label: ligne, r1: ligne + 1, r2: ligne + 2, col: col }; };
  // Grosse soirée : les deux quarts côte à côte au-dessus de l'arbre (I:K et M:O).
  let finale;
  if (P.length === 1 && n === 3) {
    finale = { titre: q, matchs: [m('F', q + 1, C)], traits: null };
    q += 5;
  } else {
    const quarts = estGrosse_(etat) ? [m('Q1', q + 1, C), m('Q2', q + 1, C + 4)] : [];
    const b = q + (quarts.length ? 4 : 0);
    finale = { titre: q, matchs: quarts.concat([m('D1', b + 1, C), m('D2', b + 7, C), m('PF', b + 11, C), m('F', b + 4, C + 4)]), traits: b };
    q = b + 15;
  }
  const final = { titre: q, debut: q + 1, n: finale.matchs.length === 1 ? 3 : 4 };
  return { matchs: matchs, blocs: blocs, finale: finale, final: final, n: n,
    derniereLigne: Math.max(r - 1, final.debut + final.n - 1) };
}

/** Lit un score de match : { joue: true, a, b } si valable, { joue: false, erreur } sinon. */
function lireScore_(a, b, L) {
  const vide = function (v) { return v === '' || v === null || v === undefined; };
  if (vide(a) && vide(b)) return { joue: false };
  if (vide(a) || vide(b)) return { joue: false, erreur: 'score incomplet' };
  const x = Number(a), y = Number(b);
  L = L || TOURNOI.legs;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > L || y > L || (x === L) === (y === L)) {
    return { joue: false, erreur: 'score impossible (' + L + ' legs gagnants)' };
  }
  return { joue: true, a: x, b: y };
}

/**
 * Classement d'une poule : victoires, puis différence de legs, puis confrontation directe
 * (matchs entre les joueurs à égalité), puis legs gagnés, puis colonne « Départage » (1 devant 2).
 */
function classerPoule_(noms, matchs, departage, p) {
  const st = {};
  noms.forEach(function (n, i) { st[n] = { nom: n, poule: p, ordre: i, J: 0, V: 0, D: 0, lp: 0, lc: 0 }; });
  matchs.forEach(function (m) {
    const a = st[m.j1], b = st[m.j2];
    a.J++; b.J++; a.lp += m.s.a; a.lc += m.s.b; b.lp += m.s.b; b.lc += m.s.a;
    if (m.s.a > m.s.b) { a.V++; b.D++; } else { b.V++; a.D++; }
  });
  const l = noms.map(function (n) { return st[n]; });
  l.forEach(function (x) {
    x.diff = x.lp - x.lc;
    const v = departage[x.nom];
    x.dep = (v === '' || v === null || v === undefined || isNaN(Number(v))) ? '' : Number(v);
  });
  const cle = function (x) { return x.V + '|' + x.diff; };
  l.forEach(function (x) {
    const grp = l.filter(function (y) { return cle(y) === cle(x); }).map(function (y) { return y.nom; });
    x.h2h = 0;
    if (grp.length < 2) return;
    matchs.forEach(function (m) {
      if (grp.indexOf(m.j1) >= 0 && grp.indexOf(m.j2) >= 0 && (m.s.a > m.s.b ? m.j1 : m.j2) === x.nom) x.h2h++;
    });
  });
  const dep = function (x) { return x.dep === '' ? 999 : x.dep; };
  l.sort(function (a, b) {
    return b.V - a.V || b.diff - a.diff || b.h2h - a.h2h || b.lp - a.lp || dep(a) - dep(b) || a.ordre - b.ordre;
  });
  const pareil = function (a, b) { return a.V === b.V && a.diff === b.diff && a.h2h === b.h2h && a.lp === b.lp && dep(a) === dep(b); };
  l.forEach(function (x, i) {
    x.rang = i + 1;
    x.egalite = (i > 0 && pareil(x, l[i - 1])) || (i < l.length - 1 && pareil(x, l[i + 1]));
    x.cle = [x.V, x.diff, x.h2h, x.lp, dep(x)].join('|'); // même clé = égalité parfaite
  });
  return l;
}

/**
 * Barrages en 1 leg d'une poule terminée (égalités parfaites qui comptent pour la qualification
 * ou les croisements, c'est-à-dire qui touchent les nq premières places) :
 *   - 2 joueurs à égalité : un barrage, le gagnant passe devant ;
 *   - 3 joueurs à égalité pour 2 places qualificatives : on repêche le joueur classé juste derrière,
 *     et les 4 jouent 2 barrages (affiches tirées au sort sur la page). Les 2 vainqueurs prennent les
 *     places, dans l'ordre du classement (à égalité : le vainqueur du premier barrage devant) ;
 *   - autres cas (rares) : ordre à la main (colonne « Départage ») ou affiches choisies à la main.
 * Modifie cl (ordre, rangs, égalités). etat.barrages = [{ p, j1, j2, a, b }] (a, b : 1 et 0, ou vides).
 */
function resoudreBarrages_(etat, cl, p, nq) {
  const L = TOURNOI.lettres[p];
  const out = { attente: false, matchs: [], repechages: [], messages: [] };
  const enreg = (etat.barrages || []).filter(function (x) { return x.p === p; });
  const joueB = function (x) { return x && (x.a === 1 || x.a === 0) && (x.b === 1 || x.b === 0) && x.a + x.b === 1; };
  const versMatch = function (x, type) {
    const m = { p: p, j1: x.j1, j2: x.j2, type: type, joue: joueB(x), a: '', b: '' };
    if (m.joue) { m.a = x.a; m.b = x.b; m.gagnant = x.a ? x.j1 : x.j2; m.perdant = x.a ? x.j2 : x.j1; }
    return m;
  };
  const groupes = [];
  for (let i = 0; i < cl.length;) {
    let j = i;
    while (j + 1 < cl.length && cl[j + 1].cle === cl[i].cle) j++;
    if (j > i && i < nq) groupes.push([i, j]);
    i = j + 1;
  }
  const placer = function (d, ordre) {
    ordre.forEach(function (x, k) { cl[d + k] = x; x.egalite = false; });
  };
  groupes.forEach(function (g) {
    const d = g[0], f = g[1], eg = cl.slice(d, f + 1), noms = eg.map(function (x) { return x.nom; });
    if (eg.length === 2) {
      const x = enreg.filter(function (y) { return noms.indexOf(y.j1) >= 0 && noms.indexOf(y.j2) >= 0 && y.j1 !== y.j2; })[0];
      const m = versMatch(x || { j1: noms[0], j2: noms[1] }, 'duel');
      out.matchs.push(m);
      if (m.joue) placer(d, m.gagnant === noms[0] ? [eg[0], eg[1]] : [eg[1], eg[0]]);
      else {
        out.attente = true;
        out.messages.push('⚔️ Égalité parfaite en poule ' + L + ' : barrage en 1 leg entre ' + noms[0] + ' et ' + noms[1] +
          ' (page du tournoi, ou 1 pour le gagnant et 2 pour l\'autre dans la colonne « Départage » de l\'onglet).');
      }
      return;
    }
    const suivant = cl[f + 1];
    const repechable = eg.length === 3 && nq - d === 2 && suivant && !(cl[f + 2] && cl[f + 2].cle === suivant.cle);
    if (!repechable) {
      out.messages.push('⚠️ Égalité parfaite en poule ' + L + ' (' + noms.join(', ') + ') : pas de barrage automatique dans ce cas. ' +
        'Indique l\'ordre à la main (clic sur leur rang dans la page du tournoi, ou colonne « Départage » de l\'onglet) ou choisis les affiches de la phase finale à la main.');
      return;
    }
    const tous = noms.concat([suivant.nom]);
    const dedans = enreg.filter(function (y) { return tous.indexOf(y.j1) >= 0 && tous.indexOf(y.j2) >= 0 && y.j1 !== y.j2; });
    const couverts = [].concat.apply([], dedans.map(function (y) { return [y.j1, y.j2]; }));
    const rep = { p: p, egaux: noms, repeche: suivant.nom, joueurs: tous, paires: null, joue: false };
    out.repechages.push(rep);
    if (dedans.length !== 2 || tous.some(function (n) { return couverts.indexOf(n) < 0; })) {
      out.messages.push('⚔️ Égalité parfaite à trois en poule ' + L + ' (' + noms.join(', ') + ') : ' + suivant.nom +
        ' est repêché. Tirez au sort les 2 barrages en 1 leg dans la page du tournoi.');
      out.attente = true;
      return;
    }
    const ms = dedans.map(function (y) { return versMatch(y, 'repechage'); });
    rep.paires = ms.map(function (m) { return [m.j1, m.j2]; });
    ms.forEach(function (m) { out.matchs.push(m); });
    if (!ms[0].joue || !ms[1].joue) {
      out.messages.push('⚔️ Barrages en poule ' + L + ' (1 leg) : ' + ms.filter(function (m) { return !m.joue; })
        .map(function (m) { return m.j1 + ' contre ' + m.j2; }).join(', ') + '.');
      out.attente = true;
      return;
    }
    rep.joue = true;
    const st = {}; cl.forEach(function (x) { st[x.nom] = x; });
    const ordre = function (l) { // joueurs à égalité avant le repêché, sinon ordre des barrages
      return l.slice().sort(function (a, b) { return (a === suivant.nom) - (b === suivant.nom); }).map(function (n) { return st[n]; });
    };
    placer(d, ordre(ms.map(function (m) { return m.gagnant; })).concat(ordre(ms.map(function (m) { return m.perdant; }))));
  });
  cl.forEach(function (x, i) { x.rang = i + 1; });
  return out;
}

/**
 * Compare deux joueurs de poules différentes (meilleur 2e, ordre des vainqueurs de poule) :
 * victoires par match, puis différence de legs et legs gagnés par match, rapportés au nombre
 * de legs gagnants de leur poule (une poule en 3 legs n'est pas avantagée).
 */
function comparerTaux_(a, b) {
  const t = function (x, v, parLegs) { return x.J ? v / x.J / (parLegs ? (x.legs || TOURNOI.legs) : 1) : 0; };
  return t(b, b.V) - t(a, a.V) || t(b, b.diff, true) - t(a, a.diff, true) || t(b, b.lp, true) - t(a, a.lp, true) || a.poule - b.poule;
}

/**
 * Calcule tout le tournoi.
 *   scoresPoules : [[legs J1, legs J2], ...] dans l'ordre de plan.matchs
 *   cellsFinale  : [{ j1, j2, a, b }, ...] ce qui est affiché dans la phase finale, dans l'ordre de plan.finale.matchs
 *   departage    : { nom: valeur de la colonne « Départage » }
 */
function calculTournoi_(etat, plan, scoresPoules, cellsFinale, departage) {
  const P = etat.poules, k = P.length, n = plan.n, L = TOURNOI.lettres;
  const messages = [];
  const etatsMatchs = [], parPoule = P.map(function () { return []; });
  let joues = 0;
  plan.matchs.forEach(function (m, i) {
    const sc = scoresPoules[i] || ['', ''];
    const s = lireScore_(sc[0], sc[1], legsPoule_(etat, m.poule));
    etatsMatchs.push(s.erreur ? '⚠️ ' + s.erreur : s.joue ? '✔' : '');
    if (s.joue) { joues++; parPoule[m.poule].push({ j1: m.j1, j2: m.j2, s: s }); }
  });
  let finies = joues === plan.matchs.length;
  const classements = P.map(function (noms, p) {
    const cl = classerPoule_(noms, parPoule[p], departage || {}, p);
    cl.forEach(function (x) { x.legs = legsPoule_(etat, p); });
    return cl;
  });

  // Égalités parfaites qui comptent pour la qualification ou les croisements : barrages en 1 leg
  const nq = k === 1 ? Math.min(4, n) : 2;
  const barrages = [], repechages = [];
  let barragesEnAttente = false;
  classements.forEach(function (cl, p) {
    const finie = parPoule[p].length === P[p].length * (P[p].length - 1) / 2;
    if (!finie) { cl.forEach(function (x) { x.egalite = false; }); return; } // une égalité ne compte qu'à la fin de la poule
    const b = resoudreBarrages_(etat, cl, p, nq);
    b.matchs.forEach(function (m) { barrages.push(m); });
    b.repechages.forEach(function (r) { repechages.push(r); });
    b.messages.forEach(function (m) { messages.push(m); });
    if (b.attente) barragesEnAttente = true;
  });
  if (barragesEnAttente) finies = false; // qualifiés connus seulement une fois les barrages joués

  // Qualifiés : { nom } si connu, { attente: 'texte' } sinon
  const qui = function (p, r, txt) { return finies ? { nom: classements[p][r].nom } : { attente: txt }; };
  const qualifies = [];
  let D1, D2, Fdirect = null, Q1 = null, Q2 = null, E1 = null, E2 = null; // E1, E2 : exemptés de quart (grosse soirée)
  if (k === 1 && n === 3) {
    Fdirect = [qui(0, 0, '1er'), qui(0, 1, '2e')];
    if (finies) qualifies.push(classements[0][0].nom, classements[0][1].nom);
  } else if (k === 1) {
    D1 = [qui(0, 0, '1er'), qui(0, 3, '4e')];
    D2 = [qui(0, 1, '2e'), qui(0, 2, '3e')];
    if (finies) classements[0].slice(0, 4).forEach(function (x) { qualifies.push(x.nom); });
  } else if (k === 2) {
    D1 = [qui(0, 0, '1er poule A'), qui(1, 1, '2e poule B')];
    D2 = [qui(1, 0, '1er poule B'), qui(0, 1, '2e poule A')];
    if (finies) [0, 1].forEach(function (p) { qualifies.push(classements[p][0].nom, classements[p][1].nom); });
  } else if (estGrosse_(etat)) {
    // Têtes de série : 1ers puis 2es, classés entre eux (comparerTaux_). Les deux meilleurs 1ers
    // attendent en demi-finale ; quart 1 : meilleur 2e contre 2e meilleur 2e (vainqueur contre le
    // meilleur 1er), quart 2 : 3e meilleur 1er contre 3e meilleur 2e (sauf s'ils viennent de la même poule).
    if (finies) {
      const v = [0, 1, 2].map(function (p) { return classements[p][0]; }).sort(comparerTaux_);
      const s = [0, 1, 2].map(function (p) { return classements[p][1]; }).sort(comparerTaux_);
      let q1 = [s[0], s[1]], q2 = [v[2], s[2]];
      if (s[2].poule === v[2].poule) { q1 = [s[0], s[2]]; q2 = [v[2], s[1]]; }
      Q1 = [{ nom: q1[0].nom }, { nom: q1[1].nom }];
      Q2 = [{ nom: q2[0].nom }, { nom: q2[1].nom }];
      E1 = { nom: v[0].nom }; E2 = { nom: v[1].nom };
      v.concat(s).forEach(function (x) { qualifies.push(x.nom); });
    } else {
      Q1 = [{ attente: 'Meilleur 2e' }, { attente: '2e meilleur 2e' }];
      Q2 = [{ attente: '3e meilleur 1er' }, { attente: '3e meilleur 2e' }];
      E1 = { attente: 'Meilleur 1er' }; E2 = { attente: '2e meilleur 1er' };
    }
  } else {
    if (finies) {
      const v = [0, 1, 2].map(function (p) { return classements[p][0]; }).sort(comparerTaux_);
      const s = [0, 1, 2].map(function (p) { return classements[p][1]; }).sort(comparerTaux_)[0];
      if (s.poule === v[0].poule) { D1 = [{ nom: v[1].nom }, { nom: s.nom }]; D2 = [{ nom: v[0].nom }, { nom: v[2].nom }]; }
      else { D1 = [{ nom: v[0].nom }, { nom: s.nom }]; D2 = [{ nom: v[1].nom }, { nom: v[2].nom }]; }
      v.forEach(function (x) { qualifies.push(x.nom); });
      qualifies.push(s.nom);
    } else {
      D1 = [{ attente: 'Meilleur 1er' }, { attente: 'Meilleur 2e' }];
      D2 = [{ attente: '2e meilleur 1er' }, { attente: '3e meilleur 1er' }];
    }
  }

  // Affiches choisies à la main (page web, « Modifier les affiches ») : prioritaires sur le calcul
  const fo = etat.forcage || null;
  const choisis = function (l) { return l.map(function (nom) { return { nom: nom }; }); };
  let force = false;
  if (fo && Fdirect && fo.F) { Fdirect = choisis(fo.F); force = true; }
  else if (fo && Q1 && fo.Q1 && fo.Q2 && fo.D1 && fo.D2) {
    Q1 = choisis(fo.Q1); Q2 = choisis(fo.Q2); E1 = { nom: fo.D1[0] }; E2 = { nom: fo.D2[0] }; force = true;
  } else if (fo && !Fdirect && !Q1 && fo.D1 && fo.D2) { D1 = choisis(fo.D1); D2 = choisis(fo.D2); force = true; }
  if (force) {
    qualifies.length = 0;
    (Fdirect || (Q1 ? Q1.concat(Q2, [E1, E2]) : D1.concat(D2))).forEach(function (x) { qualifies.push(x.nom); });
  }

  // Phase finale, dans l'ordre de calcul : demi-finales, puis finale et petite finale
  const idx = {};
  plan.finale.matchs.forEach(function (m, i) { idx[m.id] = i; });
  const finale = plan.finale.matchs.map(function () { return null; });
  const jouer = function (id, A, B) {
    const c = cellsFinale[idx[id]] || {};
    const noms = [A.nom || A.attente, B.nom || B.attente];
    const prets = !!(A.nom && B.nom);
    const vide = function (v) { return v === '' || v === null || v === undefined; };
    const aScore = !(vide(c.a) && vide(c.b));
    let s = lireScore_(c.a, c.b, legsFinale_(etat, id)), etatTxt, effacer = false;
    if (aScore && (!prets || String(c.j1) !== noms[0] || String(c.j2) !== noms[1])) {
      effacer = true; s = { joue: false };
      messages.push('Score du match « ' + LIBELLES_FINALE[id] + ' » effacé : ' +
        (prets ? 'les joueurs ont changé (score de poule corrigé ?).' : 'les joueurs ne sont pas encore connus.'));
    }
    if (s.erreur) etatTxt = '⚠️ ' + s.erreur;
    else if (s.joue) etatTxt = '✔';
    else etatTxt = prets ? 'À jouer' : 'En attente';
    const res = { id: id, j1: noms[0], j2: noms[1], effacer: effacer, etat: etatTxt, joue: !!s.joue, legs: legsFinale_(etat, id) };
    if (s.joue) {
      res.gagnant = s.a > s.b ? A.nom : B.nom;
      res.perdant = s.a > s.b ? B.nom : A.nom;
    }
    finale[idx[id]] = res;
    return res;
  };
  let F, PF = null;
  if (Fdirect) {
    F = jouer('F', Fdirect[0], Fdirect[1]);
  } else {
    const g = function (d, txt) { return d.joue ? { nom: d.gagnant } : { attente: txt }; };
    if (Q1) {
      const q1 = jouer('Q1', Q1[0], Q1[1]), q2 = jouer('Q2', Q2[0], Q2[1]);
      D1 = [E1, g(q1, 'Vainqueur quart 1')];
      D2 = [E2, g(q2, 'Vainqueur quart 2')];
    }
    const d1 = jouer('D1', D1[0], D1[1]), d2 = jouer('D2', D2[0], D2[1]);
    const pp = function (d, txt) { return d.joue ? { nom: d.perdant } : { attente: txt }; };
    F = jouer('F', g(d1, 'Vainqueur demi 1'), g(d2, 'Vainqueur demi 2'));
    PF = jouer('PF', pp(d1, 'Perdant demi 1'), pp(d2, 'Perdant demi 2'));
  }

  // Classement de la soirée
  const podium = ['', '', '', ''];
  if (F.joue) { podium[0] = F.gagnant; podium[1] = F.perdant; }
  if (PF && PF.joue) { podium[2] = PF.gagnant; podium[3] = PF.perdant; }
  if (Fdirect && force) {
    const reste = P[0].filter(function (nom) { return nom !== F.j1 && nom !== F.j2; });
    if (reste.length === 1) podium[2] = reste[0];
  } else if (Fdirect && finies) podium[2] = classements[0][2].nom;
  const termine = F.joue && (!PF || PF.joue);
  let rangs = null;
  if (termine) {
    rangs = {};
    P.forEach(function (l) { l.forEach(function (nom) { rangs[nom] = 5; }); });
    podium.forEach(function (nom, i) { if (nom) rangs[nom] = i + 1; });
  }

  let statut;
  if (termine) statut = '🏆 Tournoi terminé : ' + podium[0] + ' remporte la soirée ! Enregistre-la avec le menu 🎯 Noya\'Darts > Valider le tournoi.';
  else if (finies) statut = 'Poules terminées : place à la phase finale.';
  else if (barragesEnAttente && joues === plan.matchs.length) statut = 'Poules terminées : barrage(s) à jouer avant la phase finale.' +
    (force ? ' Phase finale lancée.' : '');
  else statut = 'Poules en cours : ' + joues + ' match(s) joué(s) sur ' + plan.matchs.length + '.' +
    (force ? ' Phase finale lancée.' : '');

  return {
    date: etat.date, etatsMatchs: etatsMatchs, classements: classements, qualifies: qualifies, finies: finies,
    finale: finale, podium: podium.slice(0, plan.final.n), termine: termine, rangs: rangs,
    avecPetiteFinale: !!PF, statut: statut, messages: messages, force: force,
    barrages: barrages, repechages: repechages,
  };
}

/* ---------- Onglet « Tournoi » ---------- */

/** Réécrit l'état du tournoi (métadonnée de l'onglet), par exemple après un record noté en cours de soirée. */
function ecrireEtatTournoi_(etat) {
  invaliderEtat_();
  DERNIER_LU_ = null; // l'état a changé : la page relira l'onglet
  const sh = ss_().getSheetByName(TOURNOI.onglet);
  if (!sh) throw new Error('Onglet « ' + TOURNOI.onglet + ' » introuvable : relance le tournoi.');
  const m = sh.getDeveloperMetadata().filter(function (x) { return x.getKey() === TOURNOI.meta; })[0];
  if (m) m.setValue(JSON.stringify(etat)); else sh.addDeveloperMetadata(TOURNOI.meta, JSON.stringify(etat));
}

function lireEtatTournoi_() {
  const sh = ss_().getSheetByName(TOURNOI.onglet);
  if (!sh) return null;
  const m = sh.getDeveloperMetadata().filter(function (x) { return x.getKey() === TOURNOI.meta; })[0];
  if (!m) return null;
  try { return JSON.parse(m.getValue()); } catch (e) { return null; }
}

/**
 * Crée (ou recrée) l'onglet « Tournoi ». Toute la mise en page est préparée en mémoire dans des grilles
 * (valeurs, couleurs, gras, tailles, alignements, menus), puis écrite d'un coup : une écriture par propriété
 * au lieu d'une par case, ce qui rend le lancement du tournoi bien plus rapide.
 */
function ecrireTournoi_(etat) {
  const ss = ss_();
  let sh = ss.getSheetByName(TOURNOI.onglet);
  if (!sh) sh = ss.insertSheet(TOURNOI.onglet, 0);
  const plan = planTournoi_(etat);
  const nbLignes = plan.derniereLigne + 3;
  if (sh.getMaxRows() < nbLignes) sh.insertRowsAfter(sh.getMaxRows(), nbLignes - sh.getMaxRows());
  if (sh.getMaxColumns() < 17) sh.insertColumnsAfter(sh.getMaxColumns(), 17 - sh.getMaxColumns());
  const tout = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  tout.breakApart();
  sh.clear();
  tout.clearDataValidations();
  sh.getDeveloperMetadata().forEach(function (m) { if (m.getKey() === TOURNOI.meta) m.remove(); });
  sh.addDeveloperMetadata(TOURNOI.meta, JSON.stringify(etat));
  invaliderEtat_();

  const ROUGE = '#d4453b', ARDOISE = '#1b2224', CRAIE = '#eceae2', SAISIE = '#fff6e0';
  const C = TOURNOI.colD, L = TOURNOI.lettres;
  const txtLegs = function (n) { return n + ' leg' + (n > 1 ? 's' : '') + ' gagnant' + (n > 1 ? 's' : ''); };

  // Grilles de la mise en page (lignes 1 à R, colonnes A à Q)
  const R = plan.derniereLigne, NC = 17;
  const G = { v: [], bg: [], fc: [], fw: [], fs: [], ha: [], dv: [] };
  const DEFAUT = { v: '', bg: null, fc: '#000000', fw: 'normal', fs: 10, ha: 'left', dv: null };
  Object.keys(G).forEach(function (k) {
    for (let r = 0; r < R; r++) { const l = []; for (let c = 0; c < NC; c++) l.push(DEFAUT[k]); G[k].push(l); }
  });
  // zone(ligne, colonne, nb lignes, nb colonnes, { v, bg, fc, fw, fs, ha, dv }) ; v peut être une grille
  const zone = function (r, c, nr, nc, o) {
    Object.keys(o).forEach(function (k) {
      for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
        G[k][r - 1 + i][c - 1 + j] = Array.isArray(o[k]) ? o[k][i][j] : o[k];
      }
    });
  };
  const entete = { bg: ARDOISE, fc: CRAIE, fw: 'bold' };
  const titre = function (r, c, texte, taille) { zone(r, c, 1, 1, { v: texte, fw: 'bold', fc: ROUGE, fs: taille || 12 }); };

  titre(1, 1, '🎯 Tournoi du jeudi ' + dateFr_(etat.date), 16);
  zone(2, 1, 1, 1, { fw: 'bold' }); // statut, écrit par majTournoi_
  zone(3, 1, 1, 1, { v: 'Choisis dans les menus les legs gagnés par chaque joueur : tout se met à jour seul.', fc: '#888' });
  zone(3, C, 1, 1, { v: 'Classements', fc: '#888' });

  // Matchs de poule (un menu des legs à côté de chaque nom)
  zone(4, 1, 1, 7, Object.assign({ v: [['Poule', 'N°', 'Joueur 1', 'Legs', 'Legs', 'Joueur 2', 'État']] }, entete));
  if (plan.matchs.length) {
    const r0 = plan.matchs[0].row, nm = plan.matchs.length;
    zone(r0, 1, nm, 7, { v: plan.matchs.map(function (m) { return ['Poule ' + L[m.poule], m.num, m.j1, '', '', m.j2, '']; }) });
    zone(r0, 4, nm, 2, { bg: SAISIE, ha: 'center', fw: 'bold' });
    zone(r0, 2, nm, 1, { ha: 'center' });
    zone(r0, 3, nm, 1, { ha: 'right' });
    etat.poules.forEach(function (noms, p) {
      const ms = plan.matchs.filter(function (m) { return m.poule === p; });
      if (!ms.length) return;
      zone(ms[0].row, 4, ms.length, 2, { dv: menuLegs_(legsPoule_(etat, p)) });
      if (p % 2) zone(ms[0].row, 1, ms.length, 3, { bg: '#f3f3f3' }); // une poule sur deux grisée
    });
  }

  // Classements des poules
  const menuDep = SpreadsheetApp.newDataValidation().requireNumberBetween(1, 20).setAllowInvalid(false)
    .setHelpText('Seulement en cas d\'égalité parfaite (si le barrage n\'est pas noté sur la page) : 1 pour le gagnant du barrage, 2 pour le suivant...').build();
  plan.blocs.forEach(function (b) {
    titre(b.titre, C, 'Poule ' + L[b.poule] + ' (' + txtLegs(legsPoule_(etat, b.poule)) + ')');
    zone(b.entete, C, 1, 9, Object.assign({ v: [['Rang', 'Joueur', 'J', 'V', 'D', 'Legs +', 'Legs -', 'Diff', 'Départage']] }, entete));
    zone(b.debut, C + 8, b.n, 1, { bg: SAISIE, ha: 'center', dv: menuDep });
    zone(b.debut, C, b.n, 1, { ha: 'center' });
    zone(b.debut, C + 2, b.n, 6, { ha: 'center' });
  });

  // Phase finale en arbre (noms, états et couleurs du moment : écrits ensuite par majTournoi_)
  const inf = infosFinale_(etat, plan);
  titre(plan.finale.titre, C, inf.titre);
  plan.finale.matchs.forEach(function (m, i) {
    zone(m.label, m.col, 1, 1, { v: inf.libelles[i], fw: 'bold', fc: m.id === 'F' ? ROUGE : '#555' });
    zone(m.r1, m.col, 2, 2, { fw: 'bold', bg: CRAIE });
    zone(m.r1, m.col + 2, 2, 1, { bg: SAISIE, ha: 'center', fw: 'bold', dv: menuLegs_(inf.legs[i]) });
  });

  // Classement de la soirée
  titre(plan.final.titre, C, 'Classement de la soirée');
  zone(plan.final.debut, C, plan.final.n, 1, { v: ['🥇 1er', '🥈 2e', '🥉 3e', '4e'].slice(0, plan.final.n).map(function (x) { return [x]; }) });
  zone(plan.final.debut, C + 1, plan.final.n, 1, { fw: 'bold' });

  // Écriture de toute la mise en page, une propriété à la fois
  sh.getRange(1, 1, R, NC).setValues(G.v).setBackgrounds(G.bg).setFontColors(G.fc).setFontWeights(G.fw)
    .setFontSizes(G.fs).setHorizontalAlignments(G.ha).setDataValidations(G.dv);

  // Ce qui ne s'écrit pas en grille : fusions des noms, cadres des matchs, traits de l'arbre
  if (plan.finale.matchs.length) {
    plan.finale.matchs.forEach(function (m) { sh.getRange(m.r1, m.col, 2, 2).mergeAcross(); });
    sh.getRangeList(plan.finale.matchs.map(function (m) { return sh.getRange(m.r1, m.col, 2, 3).getA1Notation(); }))
      .setBorder(true, true, true, true, null, true, ARDOISE, SpreadsheetApp.BorderStyle.SOLID);
  }
  if (plan.finale.traits !== null) {
    const q = plan.finale.traits, T = C + 3, st = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;
    sh.getRangeList([sh.getRange(q + 2, T).getA1Notation(), sh.getRange(q + 8, T).getA1Notation()])
      .setBorder(null, null, true, null, null, null, ROUGE, st);  // sorties des demi-finales
    sh.getRange(q + 3, T, 6, 1).setBorder(null, null, null, true, null, null, ROUGE, st); // trait vertical vers la finale
  }

  // Largeurs : A à G (matchs de poule), H (marge), I à Q (classements et arbre) ; colonnes voisines de même largeur ensemble
  const largeurs = [60, 36, 130, 46, 46, 130, 190, 20, 60, 130, 46, 46, 60, 70, 60, 50, 80];
  for (let i = 0; i < largeurs.length;) {
    let j = i; while (j + 1 < largeurs.length && largeurs[j + 1] === largeurs[i]) j++;
    sh.setColumnWidths(i + 1, j - i + 1, largeurs[i]);
    i = j + 1;
  }
  sh.setFrozenRows(4);
  try { sh.activate(); } catch (e) { /* lancé depuis la page web : pas d'onglet à afficher */ }

  // Premier calcul sans relire l'onglet : aucun score, aucun départage
  const vides = { sh: sh, etat: etat, plan: plan, departage: {},
    scores: plan.matchs.map(function () { return ['', '']; }),
    cells: plan.finale.matchs.map(function () { return { j1: '', a: '', j2: '', b: '' }; }) };
  return majTournoi_(vides);
}

/** Lit l'onglet « Tournoi » et calcule le tournoi, sans rien écrire. */
function lireTournoi_(etatDejaLu) {
  const sh = ss_().getSheetByName(TOURNOI.onglet);
  const etat = etatDejaLu || lireEtatTournoi_();
  if (!sh || !etat) throw new Error("Aucun tournoi en cours : utilise d'abord le menu 🎯 Noya'Darts > Lancer un tournoi.");
  const plan = planTournoi_(etat);
  const C = TOURNOI.colD;
  const g = sh.getRange(1, 1, plan.derniereLigne, 17).getValues();
  const cel = function (r, c) { return g[r - 1][c - 1]; };
  const scores = plan.matchs.map(function (m) { return [cel(m.row, 4), cel(m.row, 5)]; });
  const cells = plan.finale.matchs.map(function (m) {
    return { j1: cel(m.r1, m.col), a: cel(m.r1, m.col + 2), j2: cel(m.r2, m.col), b: cel(m.r2, m.col + 2) };
  });
  const departage = {};
  plan.blocs.forEach(function (b) {
    for (let i = 0; i < b.n; i++) {
      const nom = String(cel(b.debut + i, C + 1)).trim();
      if (nom) departage[nom] = cel(b.debut + i, C + 8);
    }
  });
  return { sh: sh, etat: etat, plan: plan, scores: scores, cells: cells, departage: departage,
    res: calculTournoi_(etat, plan, scores, cells, departage) };
}

/**
 * Recalcule le tournoi et réécrit classements, arbre de la phase finale et état dans l'onglet.
 * lu (facultatif) : ce qui vient d'être lu par lireTournoi_ et modifié en mémoire (score noté),
 * pour ne pas relire l'onglet. Les écritures sont groupées par blocs (une écriture par propriété).
 */
function majTournoi_(lu) {
  invaliderEtat_();
  if (lu) lu.res = calculTournoi_(lu.etat, lu.plan, lu.scores, lu.cells, lu.departage);
  else lu = lireTournoi_();
  const sh = lu.sh, etat = lu.etat, plan = lu.plan, cells = lu.cells, res = lu.res;
  const C = TOURNOI.colD;

  if (plan.matchs.length) {
    sh.getRange(plan.matchs[0].row, 7, plan.matchs.length, 1).setValues(res.etatsMatchs.map(function (x) { return [x]; }));
  }
  plan.blocs.forEach(function (b) {
    const cl = res.classements[b.poule];
    sh.getRange(b.debut, C, b.n, 9).setValues(cl.map(function (x) {
      return [x.rang + (x.egalite ? ' ⚠️' : ''), x.nom, x.J, x.V, x.D, x.lp, x.lc, x.diff, x.dep];
    }));
    sh.getRange(b.debut, C, b.n, 8).setBackgrounds(cl.map(function (x) {
      const q = res.qualifies.indexOf(x.nom) >= 0;
      return [0, 1, 2, 3, 4, 5, 6, 7].map(function () { return q ? '#e6f4ec' : null; });
    }));
  });

  // Phase finale : deux blocs de 2 colonnes (I:J et M:N), réécrits d'un coup (noms, état, couleurs).
  // Les colonnes des scores (K et O) ne sont pas touchées, sauf pour effacer un score devenu faux.
  const r0 = plan.finale.titre + 1, nb = plan.final.titre - r0;
  const libs = infosFinale_(etat, plan).libelles;
  let effaces = false;
  [C, C + 4].forEach(function (col) {
    if (nb <= 0) return;
    const grille = function (x) { const g = []; for (let i = 0; i < nb; i++) g.push([x, x]); return g; };
    const v = grille(''), fc = grille('#1b2224'), st = grille('normal'), bg = grille(null);
    plan.finale.matchs.forEach(function (m, i) {
      if (m.col !== col) return;
      const f = res.finale[i], c = cells[i], L = m.label - r0;
      v[L][0] = libs[i]; fc[L][0] = m.id === 'F' ? '#d4453b' : '#555';
      v[L][1] = f.etat; fc[L][1] = f.etat.indexOf('⚠️') === 0 ? '#a12a22' : '#888';
      [[m.r1, f.j1, 'a'], [m.r2, f.j2, 'b']].forEach(function (x) {
        const k = x[0] - r0, gagnant = f.joue && x[1] === f.gagnant, perdant = f.joue && x[1] === f.perdant;
        v[k][0] = x[1];
        fc[k][0] = perdant ? '#999' : (f.j1 && f.j2 && f.etat === 'En attente' ? '#999' : '#1b2224');
        st[k][0] = f.etat === 'En attente' ? 'italic' : 'normal';
        bg[k][0] = bg[k][1] = gagnant ? '#e6f4ec' : '#eceae2';
        if (f.effacer) { sh.getRange(x[0], m.col + 2).setValue(''); c[x[2]] = ''; effaces = true; }
      });
    });
    sh.getRange(r0, col, nb, 2).setValues(v).setFontColors(fc).setFontStyles(st).setBackgrounds(bg);
  });
  sh.getRange(plan.final.debut, C + 1, plan.final.n, 1).setValues(res.podium.map(function (x) { return [x]; }));
  sh.getRange(2, 1).setValue([res.statut].concat(res.messages).join('   '))
    .setFontColor(res.messages.length ? '#a12a22' : (res.termine ? '#1d6b43' : '#1b2224'));
  // Scores effacés : le calcul gardé pour la page tient compte des cases vidées
  if (effaces) lu.res = calculTournoi_(etat, plan, lu.scores, cells, lu.departage);
  DERNIER_LU_ = lu;
  return res;
}

function prochainJeudi_() {
  const tz = ss_().getSpreadsheetTimeZone();
  const now = new Date();
  const jour = Number(Utilities.formatDate(now, tz, 'u')); // 1 = lundi ... 7 = dimanche
  const avance = (4 - jour + 7) % 7;
  return Utilities.formatDate(new Date(now.getTime() + avance * 86400000), tz, 'yyyy-MM-dd');
}

function dateFr_(iso) {
  const d = String(iso).split('-');
  return Number(d[2]) + '/' + Number(d[1]) + '/' + d[0];
}

/* ======================== PAGE WEB DU TOURNOI (API) ======================== */
/*
 * La page tournoi.html du site appelle ce script, publié en « application Web »
 * (Déployer > Nouveau déploiement > Application Web ; exécuter en tant que : moi ;
 * accès : tout le monde).
 *   - Lecture (GET) : publique, comme les résultats du site.
 *   - Actions (POST) : il faut le code du club, défini par le menu « Code du club (page web) »
 *     et rangé dans les propriétés du document (jamais dans le code du site).
 * Après chaque modification du script : Déployer > Gérer les déploiements > crayon >
 * Version : Nouvelle version > Déployer (l'adresse de l'application reste la même).
 */

const API = { essaisMax: 10, blocageSecondes: 600 };

function definirCode() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();
  const r = ui.prompt('Code du club (page web)',
    (props.getProperty('codeClub') ? 'Un code est déjà défini. ' : '') +
    'Choisis le code à taper sur la page du tournoi pour gérer le tournoi (au moins 4 caractères) :',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const code = r.getResponseText().trim();
  if (code.length < 4) { ui.alert('Il faut au moins 4 caractères.'); return; }
  props.setProperty('codeClub', code);
  ui.alert('Code enregistré. Donne-le seulement aux personnes qui gèrent les soirées.');
}

/*
 * Performances : la réponse de la page (etatPage_) est gardée en cache (CacheService) et servie
 * telle quelle tant que rien n'a changé. Toute modification (action de la page, menu, saisie dans
 * le Google Sheet) change le numéro de version (invaliderEtat_), et le cache est alors ignoré.
 * Sécurité : le cache expire de toute façon au bout de CACHE_PAGE.secondes.
 */
const CACHE_PAGE = { cle: 'etatPage', version: 'etatPageVersion', secondes: 120 };
let DERNIER_LU_ = null; // dernier tournoi calculé pendant cette exécution (évite de relire l'onglet)

function cachePage_() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }
function versionPage_(c) {
  let v = c.get(CACHE_PAGE.version);
  if (!v) { v = String(Date.now()) + Math.random(); c.put(CACHE_PAGE.version, v, 21600); }
  return v;
}
/** À appeler après toute modification des données lues par la page. */
function invaliderEtat_() {
  const c = cachePage_();
  if (c) try { c.put(CACHE_PAGE.version, String(Date.now()) + Math.random(), 21600); } catch (e) { /* sans gravité */ }
}
/** Met en cache l'état de la page s'il correspond encore à la version v (rien n'a changé pendant le calcul). */
function memoriserEtat_(c, v, texte) {
  try { if (c.get(CACHE_PAGE.version) === v) c.put(CACHE_PAGE.cle, v + '\n' + texte, CACHE_PAGE.secondes); }
  catch (e) { /* trop gros ou cache indisponible : tant pis, on recalculera */ }
}

function doGet() {
  try {
    const c = cachePage_();
    if (!c) return json_(etatPage_());
    const v = versionPage_(c);
    const enCache = c.get(CACHE_PAGE.cle);
    if (enCache && enCache.slice(0, v.length + 1) === v + '\n') return jsonTexte_(enCache.slice(v.length + 1));
    const texte = JSON.stringify(etatPage_());
    memoriserEtat_(c, v, texte);
    return jsonTexte_(texte);
  }
  catch (e) { return json_({ ok: false, erreur: e.message }); }
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, erreur: 'Requête illisible.' }); }
  try {
    verifierCode_(req.code);
    const lectureSeule = req.action === 'verifier' || req.action === 'infosJoueur' || req.action === 'chargerSoiree';
    const resultat = actionPage_(req);
    if (!lectureSeule) invaliderEtat_();
    const c = cachePage_(), v = c ? versionPage_(c) : null;
    const texte = JSON.stringify(etatPage_());
    if (c) memoriserEtat_(c, v, texte); // le prochain affichage (et les autres écrans) en profite
    return jsonTexte_(texte.slice(0, -1) + ',"resultat":' + JSON.stringify(resultat === undefined ? null : resultat) + '}');
  } catch (err) {
    return json_({ ok: false, erreur: err.message, codeFaux: !!err.codeFaux });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function jsonTexte_(texte) {
  return ContentService.createTextOutput(texte).setMimeType(ContentService.MimeType.JSON);
}

/** Vérifie le code du club, avec blocage de 10 minutes après 10 essais ratés. */
function verifierCode_(code) {
  const attendu = PropertiesService.getDocumentProperties().getProperty('codeClub');
  if (!attendu) throw new Error("Le code du club n'est pas encore défini : menu 🎯 Noya'Darts > Code du club (page web), dans le Google Sheet.");
  const cache = CacheService.getScriptCache();
  const essais = Number(cache.get('essaisRates')) || 0;
  if (essais >= API.essaisMax) throw new Error('Trop d\'essais ratés : réessaie dans 10 minutes.');
  if (String(code || '') !== attendu) {
    cache.put('essaisRates', String(essais + 1), API.blocageSecondes);
    const err = new Error('Code du club incorrect.');
    err.codeFaux = true;
    throw err;
  }
}

function actionPage_(req) {
  switch (req.action) {
    case 'verifier': return null;
    case 'lancer': return lancerTournoi(req);
    case 'score': return ecrireScore_(req);
    case 'departage': return ecrireDepartage_(req.nom, req.valeur);
    case 'barrage': return ecrireBarrage_(req);
    case 'tirerBarrages': return tirerBarrages_(req);
    case 'ajouterJoueur': return ajouterJoueur(req.nom, !!req.forcer);
    case 'renommer': return renommerJoueur(req.ancien, req.nouveau, !!req.forcer);
    case 'infosJoueur': return infosJoueur(req.nom);
    case 'supprimer': {
      const etat = lireEtatTournoi_();
      if (etat && !colonneSoiree_(feuille_(CFG.champ), etat.date, false) &&
          [].concat.apply([], etat.poules).indexOf(req.nom) >= 0) {
        throw new Error('« ' + req.nom + " » joue le tournoi en cours, qui n'est pas encore enregistré : on ne peut pas le supprimer maintenant.");
      }
      return supprimerJoueur(req.nom);
    }
    case 'reglages': enregistrerSeuils_(req.seuil2, req.seuil3); return 'Réglages enregistrés.';
    case 'chargerSoiree': return chargerSoiree(req.date);
    case 'record': return noterRecord_(req.type, req.score, req.nom, req.retirer);
    case 'annoncer': return annoncerMatch_(req.match, !!req.on);
    case 'pause': return pauseJoueur_(req.nom, !!req.on);
    case 'forcer': return forcerAffiches_(req.affiches || null);
    case 'legsPhase': return legsPhase_(req);
    case 'annonce': return ecrireAnnonce_(req);
    case 'supprimerAnnonce': return supprimerAnnonce_(req.date);
    case 'enregistrer': {
      const msg = enregistrerSoiree({ date: req.date, rangs: req.rangs, records: req.records });
      // Les records validés deviennent ceux du tournoi (bandeau de la page)
      const etat = lireEtatTournoi_();
      if (etat && etat.date === req.date) {
        etat.records = (req.records || []).filter(function (r) { return String(r.score || '').trim() && r.nom; })
          .map(function (r) { return { type: r.type, score: Number(String(r.score).replace(',', '.')), nom: r.nom }; });
        ecrireEtatTournoi_(etat);
      }
      return msg;
    }
    default: throw new Error('Action inconnue : ' + req.action);
  }
}

/** Tout ce dont la page a besoin, en une seule réponse. */
function etatPage_() {
  return {
    ok: true,
    joueurs: lireJoueurs_(),
    venues: dernieresVenues_(),
    habitues: CFG.habitues,
    seuils: seuilsTournoi_(),
    legsMax: TOURNOI.legsMax,
    types: TYPES.map(function (t) { return { nom: t.nom, min: t.min, max: t.max, parfait: t.parfait || null }; }),
    tournoi: tournoiPage_(),
    annonces: annoncesPage_(),
  };
}

function tournoiPage_() {
  let lu = DERNIER_LU_; // déjà calculé par l'action qui vient d'avoir lieu : rien à relire
  if (!lu) {
    const etat0 = lireEtatTournoi_();
    if (!etat0) return null;
    lu = lireTournoi_(etat0);
    if (lu.res.finale.some(function (f) { return f.effacer; })) { majTournoi_(lu); lu = DERNIER_LU_; }
  }
  const etat = lu.etat, plan = lu.plan, res = lu.res;
  const v = function (x) { return x === '' || x === null || x === undefined ? '' : Number(x); };
  return {
    date: etat.date,
    poules: etat.poules,
    legs: etat.poules.map(function (l, p) { return legsPoule_(etat, p); }),
    legsFinale: legsFinale_(etat),
    grosse: estGrosse_(etat),
    matchs: plan.matchs.map(function (m, i) {
      return { i: i, poule: m.poule, num: m.num, j1: m.j1, j2: m.j2, a: v(lu.scores[i][0]), b: v(lu.scores[i][1]), etat: res.etatsMatchs[i] };
    }),
    classements: res.classements.map(function (cl) {
      return cl.map(function (x) {
        return { nom: x.nom, rang: x.rang, J: x.J, V: x.V, D: x.D, lp: x.lp, lc: x.lc, diff: x.diff, dep: x.dep, egalite: x.egalite };
      });
    }),
    qualifies: res.qualifies,
    finies: res.finies,
    finale: res.finale.map(function (f, i) {
      return { id: f.id, libelle: LIBELLES_FINALE[f.id], j1: f.j1, j2: f.j2, a: v(lu.cells[i].a), b: v(lu.cells[i].b),
        etat: f.etat, pret: f.etat !== 'En attente', joue: f.joue, gagnant: f.gagnant || '', perdant: f.perdant || '', legs: f.legs };
    }),
    podium: res.podium,
    termine: res.termine,
    rangs: res.rangs,
    statut: res.statut,
    messages: res.messages,
    enregistre: !!colonneSoiree_(feuille_(CFG.champ), etat.date, false),
    records: etat.records || [],
    annonces: (etat.annonces || []).filter(function (i) { return plan.matchs[i] && res.etatsMatchs[i] !== '✔'; }),
    pauses: etat.pauses || [],
    forcage: res.force ? etat.forcage : null,
    barrages: res.barrages.map(function (m) {
      return { p: m.p, j1: m.j1, j2: m.j2, a: m.a, b: m.b, joue: m.joue, gagnant: m.gagnant || '', type: m.type };
    }),
    repechages: res.repechages,
  };
}

/** Score d'un match : req = { match: n° du match de poule } ou { finale: 'Q1'|'Q2'|'D1'|'D2'|'PF'|'F' }, avec a et b (vides pour effacer). */
function ecrireScore_(req) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const lu = lireTournoi_();
    const vide = function (x) { return x === '' || x === null || x === undefined; };
    const effacer = vide(req.a) && vide(req.b);
    let r1, c1, r2, c2, L;
    if (req.finale) {
      const i = lu.plan.finale.matchs.findIndex(function (m) { return m.id === req.finale; });
      if (i < 0) throw new Error('Match introuvable.');
      if (!effacer && lu.res.finale[i].etat === 'En attente') throw new Error('Les joueurs de ce match ne sont pas encore connus.');
      const m = lu.plan.finale.matchs[i];
      r1 = m.r1; r2 = m.r2; c1 = c2 = m.col + 2; L = legsFinale_(lu.etat, m.id);
    } else {
      const m = lu.plan.matchs[Number(req.match)];
      if (!m) throw new Error('Match introuvable.');
      r1 = r2 = m.row; c1 = 4; c2 = 5; L = legsPoule_(lu.etat, m.poule);
    }
    if (!effacer) {
      const s = lireScore_(req.a, req.b, L);
      if (!s.joue) throw new Error('Score refusé : ' + (s.erreur || 'score incomplet') + '.');
    }
    const a = effacer ? '' : Number(req.a), b = effacer ? '' : Number(req.b);
    if (r1 === r2) lu.sh.getRange(r1, c1, 1, 2).setValues([[a, b]]);
    else { lu.sh.getRange(r1, c1).setValue(a); lu.sh.getRange(r2, c2).setValue(b); }
    // Le score est reporté dans ce qui a été lu : inutile de relire l'onglet pour recalculer
    if (req.finale) {
      const c = lu.cells[lu.plan.finale.matchs.findIndex(function (m) { return m.id === req.finale; })];
      c.a = a; c.b = b;
    } else lu.scores[Number(req.match)] = [a, b];
    if (!req.finale && !effacer && (lu.etat.annonces || []).indexOf(Number(req.match)) >= 0) {
      lu.etat.annonces = lu.etat.annonces.filter(function (i) { return i !== Number(req.match); });
      ecrireEtatTournoi_(lu.etat); // un match joué sort de « À suivre »
    }
    return majTournoi_(lu).statut;
  } finally {
    lock.releaseLock();
  }
}

/** Colonne « Départage » d'un joueur (égalité parfaite en poule). */
function ecrireDepartage_(nom, valeur) {
  const lu = lireTournoi_();
  const C = TOURNOI.colD;
  let ligne = null;
  lu.plan.blocs.forEach(function (b) {
    const noms = lu.sh.getRange(b.debut, C + 1, b.n, 1).getValues();
    noms.forEach(function (x, i) { if (String(x[0]).trim() === nom) ligne = b.debut + i; });
  });
  if (!ligne) throw new Error('Joueur introuvable dans les poules : « ' + nom + ' ».');
  const v = valeur === '' || valeur === null || valeur === undefined ? '' : Number(valeur);
  if (v !== '' && (!Number.isInteger(v) || v < 1 || v > 20)) throw new Error('Départage : un nombre de 1 à 20.');
  lu.sh.getRange(ligne, C + 8).setValue(v);
  SpreadsheetApp.flush();
  return majTournoi_().statut;
}

/**
 * Résultat d'un barrage en 1 leg : req = { poule, j1, j2, vainqueur } (vainqueur vide pour effacer).
 * Le barrage doit être l'un de ceux que le calcul demande en ce moment.
 */
function ecrireBarrage_(req) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const lu = lireTournoi_();
    const p = Number(req.poule), a = String(req.j1 || ''), b = String(req.j2 || '');
    const m = lu.res.barrages.filter(function (x) {
      return x.p === p && ((x.j1 === a && x.j2 === b) || (x.j1 === b && x.j2 === a));
    })[0];
    if (!m) throw new Error('Ce barrage n\'est pas (ou plus) à jouer : la page va se mettre à jour.');
    const v = String(req.vainqueur || '');
    if (v && v !== m.j1 && v !== m.j2) throw new Error('« ' + v + ' » ne joue pas ce barrage.');
    const etat = lu.etat;
    const meme = function (x) { return x.p === p && ((x.j1 === m.j1 && x.j2 === m.j2) || (x.j1 === m.j2 && x.j2 === m.j1)); };
    etat.barrages = (etat.barrages || []).filter(function (x) { return !meme(x); });
    etat.barrages.push({ p: p, j1: m.j1, j2: m.j2, a: v ? (v === m.j1 ? 1 : 0) : '', b: v ? (v === m.j2 ? 1 : 0) : '' });
    ecrireEtatTournoi_(etat);
    SpreadsheetApp.flush();
    majTournoi_();
    return v ? 'Barrage : ' + v + ' gagne contre ' + (v === m.j1 ? m.j2 : m.j1) + '.' : 'Résultat du barrage effacé.';
  } finally {
    lock.releaseLock();
  }
}

/**
 * Affiches des 2 barrages d'un repêchage (égalité parfaite à trois) : req = { poule, paires: [[a, b], [c, d]] },
 * tirées au sort par la page et modifiables. Refusé si l'un des barrages actuels est déjà joué.
 */
function tirerBarrages_(req) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const lu = lireTournoi_();
    const p = Number(req.poule);
    const r = lu.res.repechages.filter(function (x) { return x.p === p; })[0];
    if (!r) throw new Error('Pas de barrage à tirer au sort dans cette poule : la page va se mettre à jour.');
    const paires = (req.paires || []).map(function (x) { return (x || []).map(function (n) { return String(n || '').trim(); }); });
    const noms = [].concat.apply([], paires);
    if (paires.length !== 2 || paires.some(function (x) { return x.length !== 2; }) || noms.length !== 4 ||
        r.joueurs.some(function (n) { return noms.indexOf(n) < 0; })) {
      throw new Error('Les deux barrages doivent réunir ' + r.joueurs.join(', ') + ', chacun une seule fois.');
    }
    const dans = function (x) { return x.p === p && r.joueurs.indexOf(x.j1) >= 0 && r.joueurs.indexOf(x.j2) >= 0; };
    if (lu.res.barrages.some(function (m) { return dans(m) && m.joue; })) {
      throw new Error('Un barrage est déjà joué : efface d\'abord son résultat pour changer les affiches.');
    }
    const etat = lu.etat;
    etat.barrages = (etat.barrages || []).filter(function (x) { return !dans(x); })
      .concat(paires.map(function (x) { return { p: p, j1: x[0], j2: x[1], a: '', b: '' }; }));
    ecrireEtatTournoi_(etat);
    SpreadsheetApp.flush();
    majTournoi_();
    return 'Barrages : ' + paires.map(function (x) { return x[0] + ' contre ' + x[1]; }).join(', ') + '.';
  } finally {
    lock.releaseLock();
  }
}

/** Après un changement de nom : le tournoi en cours suit (poules et noms affichés dans l'onglet). */
function renommerDansTournoi_(ancien, nouveau) {
  const etat = lireEtatTournoi_();
  if (!etat || [].concat.apply([], etat.poules).indexOf(ancien) < 0) return;
  const r = function (n) { return n === ancien ? nouveau : n; };
  etat.poules = etat.poules.map(function (l) { return l.map(r); });
  if (etat.forcage) Object.keys(etat.forcage).forEach(function (k) { etat.forcage[k] = etat.forcage[k].map(r); });
  if (etat.pauses) etat.pauses = etat.pauses.map(r);
  if (etat.records) etat.records.forEach(function (x) { x.nom = r(x.nom); });
  if (etat.barrages) etat.barrages.forEach(function (x) { x.j1 = r(x.j1); x.j2 = r(x.j2); });
  const sh = ss_().getSheetByName(TOURNOI.onglet);
  sh.getDeveloperMetadata().forEach(function (m) { if (m.getKey() === TOURNOI.meta) m.setValue(JSON.stringify(etat)); });
  const rg = sh.getRange(1, 1, planTournoi_(etat).derniereLigne, 17);
  const vals = rg.getValues();
  let change = false;
  vals.forEach(function (l) { l.forEach(function (x, j) { if (x === ancien) { l[j] = nouveau; change = true; } }); });
  if (change) {
    // N'écrit que les cellules de noms, pour ne pas toucher aux menus et mises en forme
    vals.forEach(function (l, i) {
      l.forEach(function (x, j) { if (x === nouveau) sh.getRange(i + 1, j + 1).setValue(nouveau); });
    });
  }
  majTournoi_();
}

/**
 * Record noté en cours de soirée (bandeau de la page) : un par type, gardé avec le tournoi.
 * Il ne compte au championnat qu'à la validation de la soirée. Score vide = effacer.
 * Mêmes contrôles que la saisie d'une soirée (minimums, maximums, joueur présent).
 * Score parfait (180, 170) : il s'ajoute aux scores parfaits déjà notés (chacun compte).
 * retirer = n° (à partir de 0) d'un des détenteurs de ce type à retirer, sans toucher aux autres.
 */
function noterRecord_(type, score, nom, retirer) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const etat = lireEtatTournoi_();
    if (!etat) throw new Error('Aucun tournoi en cours.');
    const t = TYPES.find(function (x) { return x.nom === type; });
    if (!t) throw new Error('Type de record inconnu : ' + type);
    const duType = (etat.records || []).filter(function (r) { return r.type === t.nom; });
    const recs = (etat.records || []).filter(function (r) { return r.type !== t.nom; });
    const brut = String(score === undefined || score === null ? '' : score).trim().replace(',', '.');
    let msg;
    if (retirer !== undefined && retirer !== null && retirer !== '') {
      const k = Number(retirer);
      if (!duType[k]) throw new Error('Record introuvable : recharge la page.');
      msg = String(duType[k].score).replace('.', ',') + ' de ' + duType[k].nom + ' retiré.';
      duType.splice(k, 1);
      duType.forEach(function (r) { recs.push(r); });
    } else if (!brut) {
      msg = 'Record « ' + t.nom + ' » effacé.';
    } else {
      const v = Number(brut);
      if (isNaN(v)) throw new Error('« ' + score + ' » n\'est pas un nombre.');
      if (v < t.min) throw new Error(t.tropBas);
      if (v > t.max) throw new Error(t.tropHaut);
      if (!nom) throw new Error('Qui a fait le record « ' + t.nom + ' » ?');
      if ([].concat.apply([], etat.poules).indexOf(nom) < 0) throw new Error(nom + " ne joue pas ce soir, son record ne peut pas compter.");
      if (t.parfait && v === t.parfait) {
        // Score parfait : s'ajoute aux autres scores parfaits du soir (les records plus faibles sont battus)
        const parfaits = duType.filter(function (r) { return r.score === t.parfait; });
        parfaits.forEach(function (r) { recs.push(r); });
        recs.push({ type: t.nom, score: v, nom: nom });
        const tous = parfaits.map(function (r) { return r.nom; }).concat([nom]);
        msg = t.parfait + ' de ' + nom + ' noté' + (tous.length > 1 ? ' : ' + tous.length + ' ce soir (' + nomsRecord_(tous) + '), chacun compte.' : '.');
      } else {
        recs.push({ type: t.nom, score: v, nom: nom });
        msg = 'Record « ' + t.nom + ' » : ' + String(v).replace('.', ',') + ' par ' + nom + '.';
      }
    }
    recs.sort(function (a, b) {
      return TYPES.findIndex(function (x) { return x.nom === a.type; }) - TYPES.findIndex(function (x) { return x.nom === b.type; });
    });
    etat.records = recs;
    ecrireEtatTournoi_(etat);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/** Annonce un match de poule dans « À suivre » (on = true) ou l'en retire. Ses joueurs ne sont plus en pause. */
function annoncerMatch_(i, on) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const etat = lireEtatTournoi_();
    if (!etat) throw new Error('Aucun tournoi en cours.');
    i = Number(i);
    const m = planTournoi_(etat).matchs[i];
    if (!m) throw new Error('Match introuvable.');
    etat.annonces = (etat.annonces || []).filter(function (x) { return x !== i; });
    if (on) {
      etat.annonces.push(i);
      etat.pauses = (etat.pauses || []).filter(function (n) { return n !== m.j1 && n !== m.j2; });
    }
    ecrireEtatTournoi_(etat);
    return on ? m.j1 + ' contre ' + m.j2 + ' : annoncé dans « À suivre ».' : 'Match retiré de « À suivre ».';
  } finally {
    lock.releaseLock();
  }
}

/** Met un joueur en pause (ses matchs ne sont plus proposés dans « À suivre ») ou l'en sort. */
function pauseJoueur_(nom, on) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const etat = lireEtatTournoi_();
    if (!etat) throw new Error('Aucun tournoi en cours.');
    nom = String(nom || '').trim();
    if ([].concat.apply([], etat.poules).indexOf(nom) < 0) throw new Error('« ' + nom + ' » ne joue pas ce tournoi.');
    etat.pauses = (etat.pauses || []).filter(function (n) { return n !== nom; });
    if (on) etat.pauses.push(nom);
    ecrireEtatTournoi_(etat);
    return on ? nom + ' est en pause : ses matchs ne sont plus proposés.' : nom + ' est de retour.';
  } finally {
    lock.releaseLock();
  }
}

/**
 * Affiches de la phase finale choisies à la main : affiches = { D1: [a, b], D2: [c, d] }
 * (ou { F: [a, b] } pour une finale directe à 3 joueurs, ou pour une grosse soirée
 * { Q1: [a, b], Q2: [c, d], D1: [e], D2: [f] }, e et f attendant le vainqueur du quart), parmi tous les joueurs du tournoi,
 * même avant la fin des poules. null = retour au calcul automatique.
 * Refusé si cela change les joueurs d'un match déjà joué (il faut d'abord effacer son score).
 */
function forcerAffiches_(affiches) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const lu = lireTournoi_();
    const grosse = estGrosse_(lu.etat);
    const ids = lu.plan.finale.matchs.length === 1 ? ['F'] : grosse ? ['Q1', 'Q2', 'D1', 'D2'] : ['D1', 'D2'];
    const tous = [].concat.apply([], lu.etat.poules);
    let choix = null;
    if (affiches) {
      choix = {};
      const vus = [];
      ids.forEach(function (id) {
        const nb = grosse && (id === 'D1' || id === 'D2') ? 1 : 2;
        const l = (affiches[id] || []).slice(0, nb).map(function (n) { return String(n || '').trim(); });
        if (l.length !== nb || l.some(function (n) { return !n; })) {
          throw new Error(nb === 1 ? 'Choisis le joueur qui attend le vainqueur du quart en « ' + LIBELLES_FINALE[id] + ' ».'
            : 'Choisis les deux joueurs du match « ' + LIBELLES_FINALE[id] + ' ».');
        }
        l.forEach(function (n) {
          if (tous.indexOf(n) < 0) throw new Error('« ' + n + ' » ne joue pas ce tournoi.');
          if (vus.indexOf(n) >= 0) throw new Error('« ' + n + ' » est choisi deux fois.');
          vus.push(n);
        });
        choix[id] = l;
      });
    }
    const etat = JSON.parse(JSON.stringify(lu.etat));
    if (choix) etat.forcage = choix; else delete etat.forcage;
    const res = calculTournoi_(etat, lu.plan, lu.scores, lu.cells, lu.departage);
    const touche = res.finale.filter(function (f, i) { return f.effacer && lu.res.finale[i].joue; });
    if (touche.length) {
      throw new Error('Le match « ' + LIBELLES_FINALE[touche[0].id] +
        ' » est déjà joué : efface d\'abord son score pour changer ses joueurs.');
    }
    ecrireEtatTournoi_(etat);
    SpreadsheetApp.flush();
    majTournoi_();
    return choix ? 'Affiches de la phase finale modifiées.' : 'Phase finale : retour au calcul automatique.';
  } finally {
    lock.releaseLock();
  }
}

/* ============================ ANNONCES ============================ */
/*
 * Onglet « Annonces » (publié en CSV, lu par le bandeau « Prochain rendez-vous » du site) :
 * une ligne par jeudi, colonnes « Date », « Annulé » (case à cocher ou oui/x) et « Message ».
 * Géré depuis la page tournoi (panneau Gérer > Annonces) ou à la main.
 */

const ANNONCES = { onglet: 'Annonces', entetes: ['Date', 'Annulé', 'Message'], messageMax: 200 };

function estAnnule_(v) {
  if (v === true) return true;
  return ['oui', 'x', 'vrai', 'true', '1', 'annule', 'annulé'].indexOf(norm_(v)) >= 0;
}

/** Lit l'onglet « Annonces » : { sh, h (ligne d'en-tête), iD, iA, iM (colonnes, 1 = A), lignes: [{ row, iso, annule, message, brut }] }. */
function lireAnnonces_(creer) {
  let sh = ss_().getSheetByName(ANNONCES.onglet);
  if (!sh) {
    if (!creer) return null;
    sh = ss_().insertSheet(ANNONCES.onglet);
  }
  const last = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
  const vals = last ? sh.getRange(1, 1, last, lastCol).getValues() : [];
  let h = vals.findIndex(function (r) { return r.map(norm_).indexOf('date') >= 0; });
  if (h < 0) {
    if (!creer) return null;
    if (last) throw new Error('Onglet « Annonces » : il faut une colonne « Date » sur la ligne d\'en-tête (avec « Annulé » et « Message »). Corrige-la à la main.');
    sh.getRange(1, 1, 1, 3).setValues([ANNONCES.entetes]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return { sh: sh, h: 1, iD: 1, iA: 2, iM: 3, lignes: [] };
  }
  const head = vals[h].map(norm_);
  const out = { sh: sh, h: h + 1, iD: head.indexOf('date') + 1,
    iA: head.findIndex(function (x) { return x.indexOf('annul') === 0; }) + 1,
    iM: head.findIndex(function (x) { return x.indexOf('message') === 0; }) + 1, lignes: [] };
  vals.slice(h + 1).forEach(function (r, k) {
    const d = r[out.iD - 1];
    const iso = d instanceof Date ? cleDate_(d) : lireDateSaisie_(d, []);
    if (!iso) {
      // Première ligne vide (cases à cocher décochées éventuelles) : réutilisable pour une nouvelle annonce
      if (!out.libre && r.every(function (x) { return x === '' || x === null || x === false; })) out.libre = h + 2 + k;
      return;
    }
    out.lignes.push({ row: h + 2 + k, iso: iso, annule: out.iA ? estAnnule_(r[out.iA - 1]) : false,
      message: out.iM ? String(r[out.iM - 1] || '').trim() : '', brut: out.iA ? r[out.iA - 1] : '' });
  });
  return out;
}

/** Annonces pour la page (triées par date), [] si l'onglet est absent ou illisible. */
function annoncesPage_() {
  try {
    const A = lireAnnonces_(false);
    if (!A) return [];
    return A.lignes.filter(function (l) { return l.annule || l.message; })
      .map(function (l) { return { date: l.iso, annule: l.annule, message: l.message }; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  } catch (e) { return []; }
}

/**
 * Crée ou modifie l'annonce d'un jeudi : req = { date: 'aaaa-mm-jj', annule, message, ancienne }.
 * ancienne = date d'origine si on change la date d'une annonce existante.
 */
function ecrireAnnonce_(req) {
  invaliderEtat_();
  const iso = String(req.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Choisis la date du jeudi.');
  if (new Date(iso + 'T12:00:00Z').getUTCDay() !== 4) throw new Error('Choisis un jeudi : le bandeau du site ne regarde que les jeudis.');
  const annule = !!req.annule;
  const message = String(req.message || '').replace(/\s+/g, ' ').trim();
  if (message.length > ANNONCES.messageMax) throw new Error('Message trop long (' + ANNONCES.messageMax + ' caractères au plus).');
  if (!annule && !message) throw new Error('Indique que la soirée est annulée ou écris un message (pour retirer l\'annonce : « Supprimer »).');
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const A = lireAnnonces_(true), sh = A.sh;
    if (!A.iA || !A.iM) {
      // Colonne manquante : ajoutée à droite de l'en-tête
      let c = Math.max(sh.getLastColumn(), A.iD);
      if (!A.iA) { A.iA = ++c; sh.getRange(A.h, A.iA).setValue('Annulé').setFontWeight('bold'); }
      if (!A.iM) { A.iM = ++c; sh.getRange(A.h, A.iM).setValue('Message').setFontWeight('bold'); }
    }
    // Ancienne date (changement de date) et doublons : effacés, du bas vers le haut
    const ancienne = req.ancienne && req.ancienne !== iso ? String(req.ancienne) : null;
    const memes = A.lignes.filter(function (l) { return l.iso === iso; });
    const aEffacer = A.lignes.filter(function (l) { return (ancienne && l.iso === ancienne) || (l.iso === iso && l !== memes[0]); });
    // Cases à cocher si la colonne « Annulé » en contient déjà
    const cases = A.lignes.some(function (l) { return typeof l.brut === 'boolean'; });
    let row;
    if (memes.length) row = memes[0].row;
    else row = A.libre || Math.max(sh.getLastRow(), A.h) + 1;
    sh.getRange(row, A.iD).setValue(serie_(iso)).setNumberFormat('d/m/yyyy');
    const cA = sh.getRange(row, A.iA);
    if (cases) { if (!memes.length) cA.insertCheckboxes(); cA.setValue(annule); }
    else cA.setValue(annule ? 'oui' : '');
    sh.getRange(row, A.iM).setValue(message);
    aEffacer.map(function (l) { return l.row; }).sort(function (a, b) { return b - a; })
      .forEach(function (r) { sh.deleteRow(r); });
    SpreadsheetApp.flush();
    return 'Annonce du jeudi ' + dateFr_(iso) + ' enregistrée' + (annule ? ' (soirée annulée)' : '') +
      '. Le site la montrera d\'ici 5 minutes.';
  } finally {
    lock.releaseLock();
  }
}

/** Supprime l'annonce d'un jeudi. */
function supprimerAnnonce_(iso) {
  invaliderEtat_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const A = lireAnnonces_(false);
    const rows = A ? A.lignes.filter(function (l) { return l.iso === iso; }).map(function (l) { return l.row; }) : [];
    if (!rows.length) throw new Error('Pas d\'annonce pour cette date.');
    rows.sort(function (a, b) { return b - a; }).forEach(function (r) { A.sh.deleteRow(r); });
    SpreadsheetApp.flush();
    return 'Annonce du jeudi ' + dateFr_(iso) + ' supprimée. Le site suivra d\'ici 5 minutes.';
  } finally {
    lock.releaseLock();
  }
}

/* ============================ MATCHS BD ============================ */
/*
 * Onglet « Matchs BD » : une ligne par match joué (poules et phase finale), écrite à la validation
 * de la soirée. Revalider une soirée remplace ses lignes. Ne pas renommer les en-têtes.
 */

const ENTETES_MATCHS = ['Date', 'Phase', 'Joueur 1', 'Legs 1', 'Joueur 2', 'Legs 2', 'Legs gagnants', 'Vainqueur'];

/** Lignes de « Matchs BD » pour le tournoi de cette date, sans rien écrire (null si pas de tournoi à cette date). */
function lignesMatchs_(iso) {
  const etat = lireEtatTournoi_();
  if (!etat || etat.date !== iso) return null;
  const lu = lireTournoi_();
  const d = serie_(iso), lignes = [];
  lu.plan.matchs.forEach(function (m, i) {
    const L = legsPoule_(lu.etat, m.poule);
    const s = lireScore_(lu.scores[i][0], lu.scores[i][1], L);
    if (s.joue) lignes.push([d, 'Poule ' + TOURNOI.lettres[m.poule], m.j1, s.a, m.j2, s.b, L, s.a > s.b ? m.j1 : m.j2]);
  });
  lu.res.barrages.forEach(function (m) {
    if (m.joue) lignes.push([d, 'Barrage poule ' + TOURNOI.lettres[m.p], m.j1, m.a, m.j2, m.b, 1, m.gagnant]);
  });
  lu.res.finale.forEach(function (f, i) {
    if (!f.joue) return;
    const c = lu.cells[i];
    lignes.push([d, LIBELLES_FINALE[f.id], f.j1, Number(c.a), f.j2, Number(c.b), legsFinale_(lu.etat, f.id), f.gagnant]);
  });
  return lignes;
}

/** Archive les matchs du tournoi de cette date. Renvoie leur nombre (null si pas de tournoi à cette date). */
function archiverMatchs_(iso) {
  const lignes = lignesMatchs_(iso);
  if (lignes === null) return null;
  ecrireMatchsBD_(iso, lignes);
  return lignes.length;
}

function feuilleMatchs_() {
  let sh = ss_().getSheetByName(CFG.matchs);
  if (!sh) {
    sh = ss_().insertSheet(CFG.matchs);
    sh.setFrozenRows(1);
  }
  // En-têtes réécrits à chaque fois : le site en a besoin pour lire l'onglet
  sh.getRange(1, 1, 1, ENTETES_MATCHS.length).setValues([ENTETES_MATCHS]).setFontWeight('bold');
  return sh;
}

/** Remplace les matchs de la date par ces lignes, puis trie du plus récent au plus ancien (ordre des matchs gardé). */
function ecrireMatchsBD_(iso, nouvelles) {
  const sh = feuilleMatchs_();
  const n = ENTETES_MATCHS.length, last = sh.getLastRow();
  let lignes = [];
  if (last >= 2) {
    lignes = sh.getRange(2, 1, last - 1, n).getValues()
      .filter(function (l) { return l[0] instanceof Date && cleDate_(l[0]) !== iso; })
      .map(function (l) { l[0] = serie_(cleDate_(l[0])); return l; });
    sh.getRange(2, 1, last - 1, n).clearContent();
  }
  lignes = lignes.concat(nouvelles);
  lignes.sort(function (a, b) { return b[0] - a[0]; }); // tri stable : l'ordre des matchs d'une soirée est gardé
  if (lignes.length) {
    sh.getRange(2, 1, lignes.length, n).setValues(lignes);
    sh.getRange(2, 1, lignes.length, 1).setNumberFormat('d/m/yyyy');
  }
}

/* ===================== VÉRIFIER LE FICHIER ===================== */
/*
 * Menu « Vérifier le fichier » : contrôle les onglets lus par le site et par ce script
 * (en-têtes, dates, noms, cohérence entre championnat, « Records BD » et « Matchs BD »).
 * Ne modifie rien, sauf les en-têtes si on accepte la correction proposée.
 */

const ENTETES_RECORDS = ['Date', 'Type', 'Score', 'Nom'];
const ENTETES_PHOTOS = ['id', 'Nom du fichier', 'Ajoutée le'];

function verifierFichier() {
  const ui = SpreadsheetApp.getUi();
  let r;
  try { r = verifierFichier_(); } catch (e) { ui.alert('Vérification impossible : ' + e.message); return; }
  const liste = function (t) {
    const max = 12;
    return t.slice(0, max).map(function (x) { return '• ' + x; }).join('\n') + (t.length > max ? '\n• ... et ' + (t.length - max) + ' autre(s)' : '');
  };
  let msg = '';
  if (r.problemes.length) msg += 'À corriger à la main :\n' + liste(r.problemes) + '\n\n';
  if (r.corrections.length) msg += 'En-têtes à remettre d\'aplomb :\n' + liste(r.corrections.map(function (c) { return c.texte; })) + '\n\n';
  if (r.infos.length) msg += 'Pour info :\n' + liste(r.infos) + '\n\n';
  if (!r.problemes.length && !r.corrections.length) {
    ui.alert('Vérification du fichier', 'Tout est en ordre ✅\n\n' + msg.trim(), ui.ButtonSet.OK);
    return;
  }
  if (!r.corrections.length) {
    ui.alert('Vérification du fichier', msg.trim(), ui.ButtonSet.OK);
    return;
  }
  const rep = ui.alert('Vérification du fichier', msg + 'Corriger les en-têtes automatiquement ?', ui.ButtonSet.YES_NO);
  if (rep !== ui.Button.YES) return;
  r.corrections.forEach(function (c) { c.corriger(); });
  SpreadsheetApp.flush();
  ui.alert('En-têtes corrigés (' + r.corrections.length + '). Le site sera à jour d\'ici 5 minutes.' +
    (r.problemes.length ? '\n\nIl reste ' + r.problemes.length + ' point(s) à corriger à la main.' : ''));
}

/** Renvoie { problemes: [texte], corrections: [{ texte, corriger }], infos: [texte] }. */
function verifierFichier_() {
  const ss = ss_();
  const problemes = [], corrections = [], infos = [];
  const cell = function (r, c) { return lettre_(c) + r; };
  const frDate = function (iso) { const d = iso.split('-'); return Number(d[2]) + '/' + Number(d[1]) + '/' + d[0]; };
  const vide = function (v) { return v === '' || v === null; };

  // Ligne d'en-têtes attendue (comparée sans majuscules ni espaces en trop)
  const entetes = function (sh, ligne, col, attendus, nomOnglet) {
    const lus = sh.getRange(ligne, col, 1, attendus.length).getValues()[0];
    const ok = attendus.every(function (a, i) { return norm_(lus[i]) === norm_(a); });
    if (ok) return true;
    corrections.push({
      texte: '« ' + nomOnglet + ' », ' + cell(ligne, col) + ':' + cell(ligne, col + attendus.length - 1) +
        ' : « ' + lus.map(function (x) { return String(x); }).join(', ') + ' » au lieu de « ' + attendus.join(', ') + ' »',
      corriger: function () { sh.getRange(ligne, col, 1, attendus.length).setValues([attendus]).setFontWeight('bold'); },
    });
    return false;
  };

  // 1. Onglets indispensables
  [CFG.champ, CFG.bd, CFG.rec, CFG.params].forEach(function (n) {
    if (!ss.getSheetByName(n)) problemes.push('Onglet introuvable : « ' + n + ' » (il ne faut pas le renommer).');
  });

  // 2. Championnat
  const joueurs = [], soirees = {}; // soirees[iso] = { col, rangs: { nom: rang }, recs: { nom: n } }
  const champ = ss.getSheetByName(CFG.champ);
  if (champ) {
    const a2 = champ.getRange(2, 1, 1, 2).getValues()[0];
    if (norm_(a2[0]) !== 'nom') problemes.push('« ' + CFG.champ + ' », A2 : il faut « Nom » (trouvé « ' + a2[0] + ' »). Sans ça, le site n\'affiche plus le classement.');
    if (norm_(a2[1]) !== 'points') problemes.push('« ' + CFG.champ + ' », B2 : il faut « Points » (trouvé « ' + a2[1] + ' »).');

    const last = derniereLigneJoueur_(champ);
    const maxR = champ.getMaxRows();
    // Noms après une ligne vide : ignorés par le script
    if (maxR > last) {
      const apres = champ.getRange(last + 1, 1, maxR - last, 1).getValues()
        .map(function (l, i) { return { nom: String(l[0]).trim(), ligne: last + 1 + i }; })
        .filter(function (x) { return x.nom; });
      if (apres.length) problemes.push('« ' + CFG.champ + ' » : ligne vide en ' + (last + 1) + ', les joueurs en dessous sont ignorés (' +
        apres.map(function (x) { return x.nom + ' ligne ' + x.ligne; }).join(', ') + '). Supprime la ligne vide.');
    }
    const noms = last >= 3 ? champ.getRange(3, 1, last - 2, 1).getValues().map(function (l) { return String(l[0]).trim(); }) : [];
    const vus = {};
    noms.forEach(function (n) {
      joueurs.push(n);
      const k = cleNom_(n);
      if (vus[k]) problemes.push('« ' + CFG.champ + ' » : « ' + vus[k] + ' » et « ' + n + ' » sont le même joueur en double.');
      else vus[k] = n;
    });

    const lastCol = Math.max(champ.getLastColumn(), CFG.col1 + 2);
    const ligne1 = champ.getRange(1, 1, 1, lastCol).getValues()[0];
    const data = last >= 3 ? champ.getRange(3, 1, last - 2, lastCol).getValues() : [];
    const bareme = {};
    const pSh = ss.getSheetByName(CFG.params);
    if (pSh) {
      pSh.getRange(1, 1, Math.max(pSh.getLastRow(), 1), 2).getValues().forEach(function (l) {
        if (!vide(l[0]) && !isNaN(Number(l[0]))) bareme[Number(l[0])] = l[1];
      });
    }
    for (let c = CFG.col1; c <= lastCol; c += 3) {
      const v = ligne1[c - 1], iso = cleDate_(v);
      const remplie = data.some(function (l) { return !vide(l[c - 1]) || !vide(l[c]); });
      if (!iso) {
        if (!vide(v)) problemes.push('« ' + CFG.champ + ' », ' + cell(1, c) + ' : « ' + v + ' » n\'est pas une date. Chaque soirée prend 3 colonnes, avec sa date en ligne 1.');
        else if (remplie) problemes.push('« ' + CFG.champ + ' », colonnes ' + lettre_(c) + ' à ' + lettre_(c + 2) + ' : des résultats sans date en ' + cell(1, c) + '.');
        continue;
      }
      if (soirees[iso]) { problemes.push('« ' + CFG.champ + ' » : la soirée du ' + frDate(iso) + ' apparaît deux fois (' + cell(1, soirees[iso].col) + ' et ' + cell(1, c) + ').'); continue; }
      entetes(champ, 2, c, ['Classement', 'Records', 'Points'], CFG.champ);
      const s = soirees[iso] = { col: c, rangs: {}, recs: {} };
      data.forEach(function (l, i) {
        const rg = l[c - 1];
        if (vide(rg)) { if (Number(l[c]) > 0) problemes.push('« ' + CFG.champ + ' », ' + cell(3 + i, c + 1) + ' : ' + noms[i] + ' a des records le ' + frDate(iso) + ' sans classement.'); return; }
        if (bareme[Number(rg)] === undefined) problemes.push('« ' + CFG.champ + ' », ' + cell(3 + i, c) + ' : classement « ' + rg + ' » inconnu du barème (' + noms[i] + ', ' + frDate(iso) + ').');
        s.rangs[noms[i]] = Number(rg);
        if (Number(l[c]) > 0) s.recs[noms[i]] = Number(l[c]);
      });
      const nb = function (x) { return Object.keys(s.rangs).filter(function (n) { return s.rangs[n] === x; }).length; };
      if (nb(1) !== 1 || nb(2) !== 1) problemes.push('Soirée du ' + frDate(iso) + ' : ' + nb(1) + ' vainqueur(s) et ' + nb(2) + ' finaliste(s) au championnat (il en faut un de chaque).');
    }
  }
  const estJoueur = function (n) { return joueurs.indexOf(String(n).trim()) >= 0; };

  // 3. Barème des points
  const params = ss.getSheetByName(CFG.params);
  if (params) {
    const bar = {};
    params.getRange(1, 1, Math.max(params.getLastRow(), 1), 2).getValues().forEach(function (l) {
      if (!vide(l[0]) && !isNaN(Number(l[0]))) bar[Number(l[0])] = l[1];
    });
    RANGS.forEach(function (r) {
      if (bar[r.v] === undefined) problemes.push('« ' + CFG.params + ' » : pas de points pour le classement ' + r.v + ' (' + r.l + ') en colonnes A:B.');
      else if (vide(bar[r.v]) || isNaN(Number(bar[r.v]))) problemes.push('« ' + CFG.params + ' » : les points du classement ' + r.v + ' ne sont pas un nombre (« ' + bar[r.v] + ' »).');
    });
    const e1 = params.getRange('E1').getValue();
    if (vide(e1) || isNaN(Number(e1))) problemes.push('« ' + CFG.params + ' », E1 : les points par record ne sont pas un nombre (« ' + e1 + ' »).');
  }

  // 4. Records BD
  const bd = ss.getSheetByName(CFG.bd);
  const recsParSoiree = {}; // iso -> { nom: n }
  if (bd) {
    entetes(bd, 1, 1, ENTETES_RECORDS, CFG.bd);
    const last = bd.getLastRow();
    const lignes = last >= 2 ? bd.getRange(2, 1, last - 1, 4).getValues() : [];
    const types = TYPES.map(function (t) { return norm_(t.nom); });
    lignes.forEach(function (l, i) {
      const r = i + 2;
      if (l.every(vide)) return;
      const iso = cleDate_(l[0]);
      if (!iso) { problemes.push('« ' + CFG.bd + ' », ligne ' + r + ' : « ' + l[0] + ' » n\'est pas une date, la ligne est ignorée.'); return; }
      if (types.indexOf(norm_(l[1])) < 0) problemes.push('« ' + CFG.bd + ' », ligne ' + r + ' : type « ' + l[1] + ' » inconnu.');
      if (vide(l[2]) || isNaN(Number(l[2]))) problemes.push('« ' + CFG.bd + ' », ligne ' + r + ' : score « ' + l[2] + ' » qui n\'est pas un nombre.');
      const nom = String(l[3]).trim();
      if (champ && !estJoueur(nom)) problemes.push('« ' + CFG.bd + ' », ligne ' + r + ' : « ' + nom + ' » n\'est pas dans le championnat.');
      if (champ && !soirees[iso]) problemes.push('« ' + CFG.bd + ' », ligne ' + r + ' : record du ' + frDate(iso) + ', soirée absente du championnat.');
      else if (soirees[iso] && soirees[iso].rangs[nom] === undefined && estJoueur(nom)) problemes.push('« ' + CFG.bd + ' », ligne ' + r + ' : ' + nom + ' a un record le ' + frDate(iso) + ' mais n\'a pas joué ce soir-là au championnat.');
      const k = recsParSoiree[iso] = recsParSoiree[iso] || {};
      k[nom] = (k[nom] || 0) + 1;
    });
    // Nombre de records : colonne « Records » du championnat contre « Records BD »
    Object.keys(soirees).forEach(function (iso) {
      const a = soirees[iso].recs, b = recsParSoiree[iso] || {};
      Object.keys(a).concat(Object.keys(b)).filter(function (n, i, t) { return t.indexOf(n) === i; }).forEach(function (n) {
        if ((a[n] || 0) !== (b[n] || 0)) problemes.push('Soirée du ' + frDate(iso) + ' : ' + n + ' a ' + (a[n] || 0) + ' record(s) au championnat mais ' + (b[n] || 0) + ' dans « ' + CFG.bd + ' ». Rouvre la soirée (Saisir une soirée) et enregistre-la à nouveau.');
      });
    });
  }

  // 5. Matchs BD
  const mb = ss.getSheetByName(CFG.matchs);
  if (!mb) infos.push('Onglet « ' + CFG.matchs + ' » absent : il sera créé à la prochaine validation d\'un tournoi.');
  else {
    entetes(mb, 1, 1, ENTETES_MATCHS, CFG.matchs);
    const last = mb.getLastRow();
    const lignes = last >= 2 ? mb.getRange(2, 1, last - 1, ENTETES_MATCHS.length).getValues() : [];
    const inconnus = {}, sansSoiree = {};
    lignes.forEach(function (l, i) {
      const r = i + 2;
      if (l.every(vide)) return;
      const iso = cleDate_(l[0]);
      if (!iso) { problemes.push('« ' + CFG.matchs + ' », ligne ' + r + ' : « ' + l[0] + ' » n\'est pas une date, la ligne est ignorée.'); return; }
      const j1 = String(l[2]).trim(), j2 = String(l[4]).trim(), v = String(l[7]).trim();
      if (!j1 || !j2) problemes.push('« ' + CFG.matchs + ' », ligne ' + r + ' : il manque un joueur.');
      else if (cleNom_(v) !== cleNom_(j1) && cleNom_(v) !== cleNom_(j2)) problemes.push('« ' + CFG.matchs + ' », ligne ' + r + ' : le vainqueur « ' + v + ' » n\'est ni ' + j1 + ' ni ' + j2 + '.');
      if (champ) [j1, j2].forEach(function (n) { if (n && !estJoueur(n)) inconnus[n] = true; });
      if (champ && !soirees[iso]) sansSoiree[iso] = true;
    });
    if (Object.keys(inconnus).length) infos.push('« ' + CFG.matchs + ' » : joueurs absents du championnat (supprimés ou renommés à la main ?) : ' + Object.keys(inconnus).join(', ') + '. Leurs matchs restent comptés pour leurs adversaires.');
    Object.keys(sansSoiree).sort().forEach(function (iso) {
      problemes.push('« ' + CFG.matchs + ' » : matchs du ' + frDate(iso) + ', soirée absente du championnat. Pour les effacer : menu « Retirer une soirée ».');
    });
  }

  // 6. Photos et Annonces (facultatifs)
  const ph = ss.getSheetByName(CFG.photos);
  if (ph) entetes(ph, 1, 1, ENTETES_PHOTOS, CFG.photos);
  const an = ss.getSheetByName('Annonces');
  if (an) {
    const h = an.getRange(1, 1, 1, Math.max(an.getLastColumn(), 1)).getValues()[0].map(norm_);
    if (h.indexOf('date') < 0) problemes.push('« Annonces », ligne 1 : il faut une colonne « Date » (avec « Annulé » et « Message »), sinon le site ignore les annonces.');
  }

  if (champ) infos.push(Object.keys(soirees).length + ' soirée(s) et ' + joueurs.length + ' joueur(s) au championnat.');
  return { problemes: problemes, corrections: corrections, infos: infos };
}

/* ===================== RETIRER UNE SOIRÉE ===================== */
/*
 * Menu « Retirer une soirée » : efface une soirée enregistrée par erreur, partout à la fois :
 * ses colonnes du championnat (points recalculés), ses records dans « Records BD »
 * et ses matchs dans « Matchs BD ». Les joueurs restent dans la liste.
 */

function retirerSoiree() {
  const ui = SpreadsheetApp.getUi();
  let dates;
  try { dates = datesSoirees_(); } catch (e) { ui.alert(e.message); return; }
  if (!dates.length) { ui.alert('Aucune soirée enregistrée.'); return; }
  const fr = function (iso) { const d = iso.split('-'); return Number(d[2]) + '/' + Number(d[1]) + '/' + d[0]; };
  const rep = ui.prompt('Retirer une soirée',
    'Date de la soirée à retirer (par exemple ' + fr(dates[0]) + ') :\n\nDernières soirées : ' +
    dates.slice(0, 8).map(fr).join(', ') + (dates.length > 8 ? '...' : ''), ui.ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui.Button.OK) return;
  const iso = lireDateSaisie_(rep.getResponseText(), dates);
  if (!iso) { ui.alert('Date non reconnue : « ' + rep.getResponseText() + ' ». Écris-la comme ' + fr(dates[0]) + '.'); return; }
  if (dates.indexOf(iso) < 0) { ui.alert('Aucune soirée enregistrée le ' + fr(iso) + '.'); return; }

  const b = bilanSoiree_(iso);
  const quoi = [];
  if (b.joueurs) quoi.push('le classement de ' + b.joueurs + ' joueur(s) au championnat (points recalculés)');
  if (b.records) quoi.push(b.records + ' record(s) dans « ' + CFG.bd + ' »');
  if (b.matchs) quoi.push(b.matchs + ' match(s) dans « ' + CFG.matchs + ' »');
  const ok = ui.alert('Retirer la soirée du ' + fr(iso) + ' ?',
    'Seront effacés : ' + quoi.join(', ') + '.\n\n' +
    'Les joueurs restent dans la liste. Pour revenir en arrière : ressaisir la soirée, ou Fichier > Historique des versions.',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  try { ui.alert(retirerSoiree_(iso)); } catch (e) { ui.alert(e.message); }
}

/** Dates de toutes les soirées connues (championnat, Records BD, Matchs BD), de la plus récente à la plus ancienne. */
function datesSoirees_() {
  const out = {};
  const sh = feuille_(CFG.champ);
  const lastCol = Math.max(sh.getLastColumn(), CFG.col1 + 2);
  const ligne1 = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  for (let c = CFG.col1; c <= lastCol; c += 3) { const k = cleDate_(ligne1[c - 1]); if (k) out[k] = true; }
  lireRecordsBD_().forEach(function (l) { if (l.cle) out[l.cle] = true; });
  lignesMatchsBD_().forEach(function (l) { const k = cleDate_(l[0]); if (k) out[k] = true; });
  return Object.keys(out).sort().reverse();
}

/** Lignes de « Matchs BD » (vide si l'onglet n'existe pas). */
function lignesMatchsBD_() {
  const sh = ss_().getSheetByName(CFG.matchs);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ENTETES_MATCHS.length).getValues();
}

/** « 5/11/2026 », « 05/11/26 », « 5/11 » (année des soirées connues) ou « 2026-11-05 » → 'aaaa-mm-jj'. */
function lireDateSaisie_(txt, dates) {
  txt = String(txt || '').trim();
  let m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let j, mo, a;
  if (m) { a = +m[1]; mo = +m[2]; j = +m[3]; }
  else {
    m = txt.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/);
    if (!m) return null;
    j = +m[1]; mo = +m[2]; a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
  }
  if (mo < 1 || mo > 12 || j < 1 || j > 31) return null;
  const fin = '-' + ('0' + mo).slice(-2) + '-' + ('0' + j).slice(-2);
  if (a) return a + fin;
  const connue = (dates || []).filter(function (d) { return d.slice(4) === fin; })[0]; // la plus récente
  return connue || (new Date().getFullYear() + fin);
}

/** Ce que contient une soirée : { joueurs, records, matchs }. */
function bilanSoiree_(iso) {
  const sh = feuille_(CFG.champ);
  const info = colonneSoiree_(sh, iso, false);
  let joueurs = 0;
  const last = derniereLigneJoueur_(sh);
  if (info && last >= 3) {
    joueurs = sh.getRange(3, info.col, last - 2, 1).getValues().filter(function (l) { return l[0] !== '' && l[0] !== null; }).length;
  }
  return {
    joueurs: joueurs,
    records: lireRecordsBD_().filter(function (l) { return l.cle === iso; }).length,
    matchs: lignesMatchsBD_().filter(function (l) { return cleDate_(l[0]) === iso; }).length,
  };
}

/** Efface la soirée partout et renvoie le message de confirmation. */
function retirerSoiree_(iso) {
  invaliderEtat_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const b = bilanSoiree_(iso);
    const sh = feuille_(CFG.champ);
    const info = colonneSoiree_(sh, iso, false);
    if (info) {
      try { sh.getRange(1, info.col, 1, 3).breakApart(); } catch (e) { /* pas fusionné */ }
      sh.deleteColumns(info.col, 3); // les soirées suivantes reculent de 3 colonnes, l'ordre est gardé
    }
    if (b.records) ecrireRecordsBD_(iso, []);
    if (b.matchs) ecrireMatchsBD_(iso, []);
    // La soirée du 1er octobre est réimportée par « Réparer le fichier » si elle manque : on note qu'elle a été retirée exprès
    if (iso === SOIREE_1ER_OCTOBRE.date) PropertiesService.getDocumentProperties().setProperty('soiree1erOctobreRetiree', 'oui');

    // Points recalculés, championnat retrié, onglet Records recalculé (comme à l'enregistrement d'une soirée)
    refreshFormules_(sh);
    SpreadsheetApp.flush();
    const n = derniereLigneJoueur_(sh) - 2;
    if (n > 0) sh.getRange(3, 1, n, sh.getLastColumn()).sort([{ column: 2, ascending: false }, { column: 1, ascending: true }]);
    refreshFormules_(sh);
    installerOngletRecords_();
    SpreadsheetApp.flush();

    const venues = dernieresVenues_();
    const sansSoiree = Object.keys(venues).filter(function (nom) { return !venues[nom]; });
    const d = iso.split('-');
    let msg = 'Soirée du ' + Number(d[2]) + '/' + Number(d[1]) + '/' + d[0] + ' retirée : ' +
      b.joueurs + ' classement(s), ' + b.records + ' record(s), ' + b.matchs + ' match(s) effacés. Le site sera à jour d\'ici 5 minutes.';
    if (sansSoiree.length) msg += '\n\nCes joueurs n\'ont plus aucune soirée (ils n\'apparaissent plus sur le site, mais restent dans la liste) : ' +
      sansSoiree.join(', ') + '. Pour les enlever : menu « Supprimer un joueur ».';
    const etat = lireEtatTournoi_();
    if (etat && etat.date === iso) msg += '\n\nL\'onglet « Tournoi » de ce soir-là est toujours là : « Valider le tournoi » permet de réenregistrer la soirée.';
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/* ============================ PHOTOS ============================ */

/** Demande le lien du dossier Google Drive des photos et le mémorise. Renvoie l'ID ou null. */
function choisirDossierPhotos() {
  const ui = SpreadsheetApp.getUi();
  const rep = ui.prompt('Dossier des photos',
    'Colle le lien du dossier Google Drive qui contient les photos du site\n' +
    '(dans Drive : clic droit sur le dossier > Partager > Copier le lien) :', ui.ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui.Button.OK) return null;
  const txt = rep.getResponseText().trim();
  const m = txt.match(/folders\/([A-Za-z0-9_-]+)/) || txt.match(/[?&]id=([A-Za-z0-9_-]+)/) || txt.match(/^([A-Za-z0-9_-]{15,})$/);
  if (!m) { ui.alert("Ce lien ne ressemble pas à un lien de dossier Google Drive."); return null; }
  let dossier;
  try { dossier = DriveApp.getFolderById(m[1]); }
  catch (e) { ui.alert("Dossier introuvable, ou tu n'y as pas accès avec ce compte Google."); return null; }
  PropertiesService.getDocumentProperties().setProperty('dossierPhotos', m[1]);
  ss_().toast('Dossier « ' + dossier.getName() + ' » enregistré', "Noya'Darts", 4);
  return m[1];
}

/**
 * Liste les images du dossier dans l'onglet "Photos" (de la plus récente à la plus ancienne)
 * et les rend visibles par "tous les utilisateurs disposant du lien", condition pour
 * qu'elles s'affichent sur le site.
 */
function majPhotos() {
  const ui = SpreadsheetApp.getUi();
  let id = PropertiesService.getDocumentProperties().getProperty('dossierPhotos');
  if (!id) id = choisirDossierPhotos();
  if (!id) return;

  let dossier;
  try { dossier = DriveApp.getFolderById(id); }
  catch (e) { ui.alert("Le dossier photos est introuvable. Choisis-le à nouveau (menu « Changer le dossier photos »)."); return; }

  const photos = [], refus = [];
  const it = dossier.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed() || !/^image\//.test(f.getMimeType())) continue;
    try {
      if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK && f.getSharingAccess() !== DriveApp.Access.ANYONE) {
        f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }
      photos.push([f.getId(), f.getName(), f.getDateCreated()]);
    } catch (e) {
      refus.push(f.getName());
    }
  }
  photos.sort(function (a, b) { return b[2] - a[2]; });

  let sh = ss_().getSheetByName(CFG.photos);
  if (!sh) sh = ss_().insertSheet(CFG.photos);
  sh.clearContents();
  sh.getRange(1, 1, 1, 3).setValues([['id', 'Nom du fichier', 'Ajoutée le']]).setFontWeight('bold');
  if (photos.length) {
    sh.getRange(2, 1, photos.length, 3).setValues(photos);
    sh.getRange(2, 3, photos.length, 1).setNumberFormat('d/m/yyyy');
  }

  const props = PropertiesService.getDocumentProperties();
  let msg = photos.length + ' photo(s) dans le dossier « ' + dossier.getName() + ' ». Le site sera à jour d\'ici 5 minutes.';
  if (refus.length) msg += '\n\nCes photos n\'ont pas pu être partagées et ne s\'afficheront pas : ' + refus.join(', ');
  if (!props.getProperty('photosPubliees')) {
    msg += '\n\nPremière fois : publie l\'onglet « Photos » en CSV (Fichier > Partager > Publier sur le Web, ' +
      'choisis l\'onglet « Photos » et le format CSV), puis envoie le lien obtenu pour qu\'il soit ajouté au site.';
    props.setProperty('photosPubliees', 'rappel-fait');
  }
  ui.alert('Photos', msg, ui.ButtonSet.OK);
}

/* ============================ OUTILS ============================ */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function feuille_(nom) {
  const sh = ss_().getSheetByName(nom);
  if (!sh) throw new Error('Onglet introuvable : « ' + nom + ' ». Il ne faut pas le renommer.');
  return sh;
}

function norm_(s) { return String(s || '').trim().toLowerCase(); }

/** Nom simplifié pour comparer : sans accents, majuscules, espaces ni ponctuation. */
function cleNom_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Distance d'édition entre deux textes (nombre de lettres à changer, ajouter ou retirer). */
function distance_(a, b) {
  let prec = [];
  for (let j = 0; j <= b.length; j++) prec.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) {
      cour.push(Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prec = cour;
  }
  return prec[b.length];
}

/**
 * Joueurs dont le nom ressemble à celui proposé :
 *   - l'un contient l'autre ("Alex" / "Alexandre", "Bob" / "Bob le fou")
 *   - ou une faute de frappe d'écart ("Bast Ze Kid" / "Bast le Kid", "Nicco" / "Nico")
 */
function joueursProches_(nom, joueurs) {
  const a = cleNom_(nom);
  return joueurs.filter(function (j) {
    const b = cleNom_(j);
    if (!a || !b) return false;
    const court = a.length <= b.length ? a : b;
    const long = a.length <= b.length ? b : a;
    if (court.length >= 3 && long.indexOf(court) >= 0) return true;
    return distance_(a, b) <= (court.length <= 5 ? 1 : 2);
  });
}

/** Ligne d'un joueur dans le championnat (null s'il n'existe pas). */
function ligneJoueur_(sh, nom) {
  const i = lireJoueurs_().indexOf(String(nom || '').trim());
  return i < 0 ? null : 3 + i;
}

function cleDate_(v) {
  if (!(v instanceof Date)) return '';
  return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

/** Numéro de série Google Sheets d'une date 'aaaa-mm-jj' (évite tout souci de fuseau horaire). */
function serie_(iso) {
  const d = iso.split('-').map(Number);
  return (Date.UTC(d[0], d[1] - 1, d[2]) - Date.UTC(1899, 11, 30)) / 86400000;
}

function dernierJeudi_() {
  const tz = ss_().getSpreadsheetTimeZone();
  const now = new Date();
  const jour = Number(Utilities.formatDate(now, tz, 'u')); // 1 = lundi ... 7 = dimanche
  const recul = (jour - 4 + 7) % 7;
  return Utilities.formatDate(new Date(now.getTime() - recul * 86400000), tz, 'yyyy-MM-dd');
}

function lettre_(c) {
  let s = '';
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}

/** Dernière ligne contenant un nom de joueur (2 s'il n'y en a aucun). */
function derniereLigneJoueur_(sh) {
  const max = sh.getMaxRows();
  if (max < 3) return 2;
  const vals = sh.getRange(3, 1, max - 2, 1).getValues();
  let n = 0;
  while (n < vals.length && String(vals[n][0]).trim() !== '') n++;
  return 2 + n;
}

/**
 * Date de la dernière soirée jouée par chaque joueur, d'après le championnat :
 * { nom: 'aaaa-mm-jj' }, ou '' s'il n'a encore jamais joué.
 */
function dernieresVenues_() {
  const sh = feuille_(CFG.champ);
  const last = derniereLigneJoueur_(sh);
  const out = {};
  if (last < 3) return out;
  const lastCol = Math.max(sh.getLastColumn(), CFG.col1 + 2);
  const ligne1 = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const entetes = sh.getRange(2, 1, 1, lastCol).getValues()[0];
  const data = sh.getRange(3, 1, last - 2, lastCol).getValues();
  const soirees = [];
  for (let c = CFG.col1; c <= lastCol; c += 3) {
    const iso = cleDate_(ligne1[c - 1]);
    if (!iso) continue;
    let k = c; // colonne « Classement » de la soirée (la première en principe)
    for (let j = c; j < c + 3 && j <= lastCol; j++) if (norm_(entetes[j - 1]) === 'classement') { k = j; break; }
    soirees.push({ iso: iso, col: k });
  }
  data.forEach(function (l) {
    const nom = String(l[0]).trim();
    let v = '';
    soirees.forEach(function (s) {
      const x = l[s.col - 1];
      if (x !== '' && x !== null && s.iso > v) v = s.iso;
    });
    out[nom] = v;
  });
  return out;
}

function lireJoueurs_() {
  const sh = feuille_(CFG.champ);
  const last = derniereLigneJoueur_(sh);
  if (last < 3) return [];
  return sh.getRange(3, 1, last - 2, 1).getValues().map(function (r) { return String(r[0]).trim(); });
}

/**
 * Calcule les points de chaque soirée et le total (colonne B) de chaque joueur,
 * et les écrit directement en nombres (sans formule : Google refusait les formules
 * écrites par le script dans ce fichier, "Erreur d'analyse de formule").
 * Points d'une soirée = barème du classement + nombre de records x points par record,
 * lus dans l'onglet "Paramètres points championnat" (colonnes A:B et cellule E1).
 */
function refreshFormules_(sh) {
  const last = derniereLigneJoueur_(sh);
  if (last < 3) return;
  const n = last - 2;
  const lastCol = Math.max(sh.getLastColumn(), CFG.col1 + 2);

  const p = feuille_(CFG.params);
  const bareme = {};
  p.getRange(1, 1, Math.max(p.getLastRow(), 1), 2).getValues().forEach(function (r) {
    if (r[0] !== '' && r[0] !== null && !isNaN(Number(r[0]))) bareme[Number(r[0])] = Number(r[1]) || 0;
  });
  const parRecord = Number(p.getRange('E1').getValue()) || 0;

  const entetes = sh.getRange(2, 1, 1, lastCol).getValues()[0];
  const data = sh.getRange(3, 1, n, lastCol).getValues();

  // Points de chaque soirée
  for (let c = CFG.col1; c + 2 <= lastCol; c += 3) {
    const col = data.map(function (ligne) {
      const rang = ligne[c - 1];
      if (rang === '' || rang === null || bareme[Number(rang)] === undefined) return [''];
      return [bareme[Number(rang)] + (Number(ligne[c]) || 0) * parRecord];
    });
    col.forEach(function (v, i) { data[i][c + 1] = v[0]; });
    sh.getRange(3, c + 2, n, 1).setValues(col);
  }

  // Total : somme des colonnes dont l'en-tête (ligne 2) est le même que celui de la colonne B ("Points")
  const cle = norm_(entetes[1]) || 'points';
  sh.getRange(3, 2, n, 1).setValues(data.map(function (ligne) {
    let t = 0;
    for (let c = 3; c <= lastCol; c++) {
      if (norm_(entetes[c - 1]) === cle && typeof ligne[c - 1] === 'number') t += ligne[c - 1];
    }
    return [t];
  }));
}

/** Trouve la colonne d'une soirée ; la crée si demandé. */
function colonneSoiree_(sh, iso, creer) {
  const lastCol = Math.max(sh.getLastColumn(), CFG.col1 + 2);
  const ligne1 = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  let libre = null;
  for (let c = CFG.col1; c <= lastCol; c += 3) {
    const k = cleDate_(ligne1[c - 1]);
    if (k === iso) return { col: c, nouvelle: false };
    if (!k && libre === null) libre = c;
  }
  if (!creer) return null;
  let c = libre;
  if (c === null) c = CFG.col1 + 3 * Math.ceil((lastCol - CFG.col1 + 1) / 3);
  if (sh.getMaxColumns() < c + 2) sh.insertColumnsAfter(sh.getMaxColumns(), c + 2 - sh.getMaxColumns());
  const lastRow = Math.max(derniereLigneJoueur_(sh), 3);
  if (c > CFG.col1) {
    sh.getRange(1, c - 3, lastRow, 3).copyTo(sh.getRange(1, c, lastRow, 3), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  try { sh.getRange(1, c, 1, 3).merge(); } catch (e) { /* déjà fusionné */ }
  sh.getRange(1, c).setValue(serie_(iso)).setNumberFormat('d/m/yyyy');
  sh.getRange(2, c, 1, 3).setValues([['Classement', 'Records', 'Points']]);
  return { col: c, nouvelle: true };
}

function typeCanonique_(t) {
  const x = TYPES.find(function (y) { return norm_(y.nom) === norm_(t); });
  return x ? x.nom : t;
}

function lireRecordsBD_() {
  const sh = feuille_(CFG.bd);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 4).getValues()
    .filter(function (l) { return l[0] instanceof Date; })
    .map(function (l) { return { cle: cleDate_(l[0]), type: typeCanonique_(l[1]), score: l[2], nom: String(l[3]).trim() }; });
}

/** Réécrit "Records BD" : remplace les records de la date, puis trie du plus récent au plus ancien. */
function ecrireRecordsBD_(iso, recs) {
  const lignes = lireRecordsBD_()
    .filter(function (l) { return l.cle !== iso; })
    .map(function (l) { return [serie_(l.cle), l.type, l.score, l.nom]; });
  recs.forEach(function (r) { lignes.push([serie_(iso), r.type, r.score, r.nom]); });
  ecrireLignesBD_(lignes);
}

/** Remplace tout le contenu de "Records BD" par ces lignes, triées du plus récent au plus ancien. */
function ecrireLignesBD_(lignes) {
  const sh = feuille_(CFG.bd);
  const lastAvant = sh.getLastRow();
  const ordre = function (t) { const i = TYPES.findIndex(function (x) { return x.nom === t; }); return i < 0 ? 9 : i; };
  lignes.sort(function (a, b) { return b[0] - a[0] || ordre(a[1]) - ordre(b[1]); });
  if (lastAvant >= 2) sh.getRange(2, 1, lastAvant - 1, 4).clearContent();
  if (lignes.length) {
    sh.getRange(2, 1, lignes.length, 4).setValues(lignes);
    sh.getRange(2, 1, lignes.length, 1).setNumberFormat('d/m/yyyy');
  }
}

/* ======================= FENÊTRE DE SAISIE ======================= */

const HTML_SAISIE = `<!DOCTYPE html>
<html><head><base target="_top">
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1b2224;margin:0;padding:12px 16px}
  .haut{display:flex;align-items:center;gap:12px;margin-bottom:10px}
  .haut label{font-weight:bold}
  #etat{color:#555;font-size:12px}
  fieldset{border:1px solid #ddd;border-radius:8px;margin:0 0 12px;padding:8px 12px}
  legend{font-weight:bold;padding:0 6px;color:#d4453b}
  .aide{color:#888;font-size:11px;margin:0 0 6px}
  .joueurs{display:grid;grid-template-columns:1fr 1fr;gap:3px 14px}
  .j{display:flex;align-items:center;gap:6px;padding:2px 6px;border-radius:5px}
  .j.present{background:#e6f4ec}
  .j span{flex:1;cursor:pointer;user-select:none}
  select,input{font-size:13px;padding:3px 4px}
  .rec{display:grid;grid-template-columns:140px 90px 1fr;gap:8px;align-items:center;margin:5px 0}
  .plus{margin:0 0 8px 148px}.plus .btn2{padding:3px 8px;font-size:11px}
  .ajout{display:flex;gap:6px;margin-top:8px}
  .ajout input{flex:1}
  .btn{background:#d4453b;color:#fff;border:0;border-radius:6px;padding:9px 18px;font-size:14px;cursor:pointer}
  .btn:disabled{opacity:.5;cursor:wait}
  .btn2{background:#eee;color:#333;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}
  .bas{display:flex;justify-content:space-between;align-items:center}
  #msg{margin-top:10px;padding:8px 10px;border-radius:6px;display:none}
  .ok{background:#e6f4ec;color:#1d6b43}.err{background:#fbeaea;color:#a12a22}.warn{background:#fff6e0;color:#7a5600}
  #ecarts{display:none;margin-bottom:10px;padding:6px 10px;border-radius:6px}
</style></head>
<body>
  <div class="haut">
    <label for="date">Date de la soirée</label>
    <input type="date" id="date" onchange="charger()">
    <span id="etat">Chargement...</span>
  </div>
  <div id="ecarts" class="warn"></div>

  <fieldset>
    <legend>Joueurs et classement</legend>
    <p class="aide">Clique sur un nom pour le marquer présent (participation) ou absent, puis choisis le classement des 4 premiers.</p>
    <div id="joueurs" class="joueurs"></div>
    <div class="ajout">
      <input id="nouveau" placeholder="Nouveau joueur (nom)">
      <button class="btn2" onclick="ajouter()">Ajouter</button>
    </div>
    <p class="aide" id="compteur"></p>
  </fieldset>

  <fieldset>
    <legend>Records de la soirée</legend>
    <p class="aide">Laisse vide s'il n'y a pas de record. Minimums : 50 de moyenne, 100 pour une volée, 60 pour une sortie.
    Chaque 180 et chaque 170 en sortie compte : une ligne par score parfait, même pour le même joueur.</p>
    <div id="records"></div>
  </fieldset>

  <div class="bas">
    <button class="btn2" onclick="google.script.host.close()">Fermer</button>
    <button class="btn" id="go" onclick="enregistrer()">Enregistrer la soirée</button>
  </div>
  <div id="msg"></div>

<script>
var JOUEURS = [], TYPES = [], RANGS = [];
var DEPUIS_TOURNOI = null;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function message(txt, cls){ var m = $('msg'); m.textContent = txt; m.className = cls; m.style.display = txt ? 'block' : 'none'; }

google.script.run.withSuccessHandler(init).withFailureHandler(erreur).donneesSaisie();

function init(d){
  JOUEURS = d.joueurs; TYPES = d.types; RANGS = d.rangs;
  $('date').value = DEPUIS_TOURNOI ? DEPUIS_TOURNOI.date : d.dateDefaut;
  charger();
}
function erreur(e){ $('go').disabled = false; message(e && e.message ? e.message : String(e), 'err'); }

function charger(){
  var date = $('date').value;
  if (!date) return;
  $('etat').textContent = 'Chargement...';
  message('', '');
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(s){
    var rangs = s.rangs, note = '';
    if (DEPUIS_TOURNOI && DEPUIS_TOURNOI.date === date){ rangs = DEPUIS_TOURNOI.rangs; note = ' Classement et records repris du tournoi : vérifie puis enregistre.'; }
    Object.keys(rangs).forEach(function(n){ if (JOUEURS.indexOf(n) < 0) JOUEURS.push(n); });
    dessinerJoueurs(rangs);
    dessinerRecords(DEPUIS_TOURNOI && DEPUIS_TOURNOI.date === date && DEPUIS_TOURNOI.records && DEPUIS_TOURNOI.records.length ? DEPUIS_TOURNOI.records : s.records);
    $('etat').textContent = (s.existe ? '✏️ Soirée déjà enregistrée : tu peux la corriger.' : '🆕 Nouvelle soirée') + note;
    var e = $('ecarts');
    if (s.ecarts && s.ecarts.length){ e.textContent = '⚠️ ' + s.ecarts.join(' ; ') + '. Complète les records avant d\\'enregistrer, sinon les points seront recalculés.'; e.style.display = 'block'; }
    else { e.style.display = 'none'; }
  }).chargerSoiree(date);
}

function rangsActuels(){
  var r = {};
  document.querySelectorAll('#joueurs select').forEach(function(s){ if (s.value) r[s.dataset.nom] = s.value; });
  return r;
}
function presents(){ return Object.keys(rangsActuels()); }

function dessinerJoueurs(rangs){
  var box = $('joueurs'); box.innerHTML = '';
  JOUEURS.forEach(function(n){
    var div = document.createElement('div'); div.className = 'j';
    var sp = document.createElement('span'); sp.textContent = n; sp.title = 'Clic : présent / absent';
    var sel = document.createElement('select'); sel.dataset.nom = n;
    sel.innerHTML = '<option value="">absent</option>' + RANGS.map(function(r){ return '<option value="' + r.v + '">' + r.l + '</option>'; }).join('');
    sel.value = rangs[n] ? String(rangs[n]) : '';
    sp.onclick = function(){ sel.value = sel.value ? '' : '5'; maj(); };
    sel.onchange = maj;
    div.appendChild(sp); div.appendChild(sel); box.appendChild(div);
  });
  maj();
}

function ligneRecord(t, r, avant){
  var div = document.createElement('div'); div.className = 'rec';
  div.innerHTML = '<label>' + esc(t.nom) + '</label>' +
    '<input class="recscore" data-type="' + esc(t.nom) + '" placeholder="' + t.min + ' à ' + t.max + '" value="' + (r.score !== undefined ? esc(String(r.score).replace('.', ',')) : '') + '">' +
    '<select class="recnom" data-init="' + esc(r.nom || '') + '"></select>';
  $('records').insertBefore(div, avant || null);
  return div;
}

/* Scores parfaits (180, 170) : une ligne par score parfait, bouton pour en ajouter un autre */
function dessinerRecords(recs){
  var box = $('records'); box.innerHTML = '';
  TYPES.forEach(function(t){
    var l = recs.filter(function(x){ return x.type === t.nom; });
    if (!l.length) l = [{}];
    l.forEach(function(r){ ligneRecord(t, r); });
    if (t.parfait){
      var b = document.createElement('div'); b.className = 'plus';
      b.innerHTML = '<button class="btn2" type="button">+ un autre ' + t.parfait + '</button>';
      b.querySelector('button').onclick = function(){ ligneRecord(t, { score: t.parfait }, b); maj(); };
      box.appendChild(b);
    }
  });
  maj();
  document.querySelectorAll('.recnom').forEach(function(s){ if (s.dataset.init) s.value = s.dataset.init; });
}

function maj(){
  document.querySelectorAll('#joueurs select').forEach(function(s){ s.parentNode.className = 'j' + (s.value ? ' present' : ''); });
  var p = presents();
  $('compteur').textContent = p.length + ' joueur(s) présent(s)';
  document.querySelectorAll('.recnom').forEach(function(s){
    var v = s.value || s.dataset.init;
    s.innerHTML = '<option value="">qui ?</option>' + p.map(function(n){ return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
    if (p.indexOf(v) >= 0) s.value = v;
    s.dataset.init = '';
  });
}

function ajouter(forcer){
  var nom = $('nouveau').value.trim();
  if (!nom){ message("T'es bidon mec, il faut taper le nom avant de valider...", 'err'); return; }
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(res){
    if (!res.ajoute){
      var m = $('msg'); m.className = 'warn'; m.style.display = 'block';
      m.innerHTML = '⚠️ « ' + esc(res.nom) + ' » ressemble à : <b>' + res.proches.map(esc).join(', ') + '</b>. ' +
        'Est-ce bien un nouveau joueur ?<div style="margin-top:6px;display:flex;gap:6px">' +
        '<button class="btn2" id="ouiAjout">Oui, ajouter « ' + esc(res.nom) + ' »</button>' +
        '<button class="btn2" id="nonAjout">Non, annuler</button></div>';
      $('ouiAjout').onclick = function(){ ajouter(true); };
      $('nonAjout').onclick = function(){
        $('nouveau').value = '';
        message('Ajout annulé. Clique plutôt sur le nom existant dans la liste pour le marquer présent.', 'ok');
      };
      return;
    }
    var n = res.nom;
    var r = rangsActuels(); r[n] = '5';
    JOUEURS.push(n); $('nouveau').value = '';
    dessinerJoueurs(r);
    message('« ' + n + ' » est ajouté et marqué présent.', 'ok');
  }).ajouterJoueur(nom, !!forcer);
}

function enregistrer(){
  var recs = [];
  document.querySelectorAll('.rec').forEach(function(div){
    recs.push({ type: div.querySelector('.recscore').dataset.type, score: div.querySelector('.recscore').value, nom: div.querySelector('.recnom').value });
  });
  $('go').disabled = true;
  message('Enregistrement en cours...', 'warn');
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(txt){
    $('go').disabled = false;
    message('✅ ' + txt, 'ok');
    $('etat').textContent = '✏️ Soirée déjà enregistrée : tu peux la corriger.';
    $('ecarts').style.display = 'none';
  }).enregistrerSoiree({ date: $('date').value, rangs: rangsActuels(), records: recs });
}
</script>
</body></html>`;

/* ===================== FENÊTRE DE SUPPRESSION ===================== */

const HTML_SUPPRESSION = `<!DOCTYPE html>
<html><head><base target="_top">
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1b2224;margin:0;padding:12px 16px}
  label{font-weight:bold;display:block;margin-bottom:6px}
  select{font-size:13px;padding:4px;width:100%}
  .aide{color:#888;font-size:11px;margin:6px 0 0}
  .zone{margin-top:12px;padding:8px 10px;border-radius:6px;display:none;line-height:1.4}
  .ok{background:#e6f4ec;color:#1d6b43}.err{background:#fbeaea;color:#a12a22}.warn{background:#fff6e0;color:#7a5600}
  .btn{background:#d4453b;color:#fff;border:0;border-radius:6px;padding:9px 18px;font-size:14px;cursor:pointer}
  .btn:disabled{opacity:.5;cursor:default}
  .btn2{background:#eee;color:#333;border:0;border-radius:6px;padding:8px 12px;cursor:pointer}
  .bas{display:flex;justify-content:space-between;align-items:center;margin-top:14px}
</style></head>
<body>
  <label for="joueur">Joueur à supprimer</label>
  <select id="joueur" onchange="choisir()"><option value="">Chargement...</option></select>
  <p class="aide">Pour un doublon : si le doublon a déjà des résultats qui appartiennent en fait à l'autre joueur,
  corrige d'abord la soirée concernée (menu Saisir une soirée, même date), puis supprime le doublon.</p>
  <div id="detail" class="zone"></div>
  <div id="msg" class="zone"></div>
  <div class="bas">
    <button class="btn2" onclick="google.script.host.close()">Fermer</button>
    <button class="btn" id="go" onclick="demander()" disabled>Supprimer</button>
  </div>

<script>
var INFO = null;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function zone(id, html, cls){ var z = $(id); z.innerHTML = html; z.className = 'zone ' + (cls || ''); z.style.display = html ? 'block' : 'none'; }
function erreur(e){ $('go').disabled = !INFO; zone('msg', esc(e && e.message ? e.message : String(e)), 'err'); }

function chargerListe(){
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(l){
    $('joueur').innerHTML = '<option value="">Choisis un joueur</option>' +
      l.map(function(n){ return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
  }).listeJoueurs();
}
chargerListe();

function choisir(){
  var nom = $('joueur').value;
  INFO = null; $('go').disabled = true; zone('msg', ''); zone('detail', '');
  if (!nom) return;
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(i){
    INFO = i; $('go').disabled = false;
    if (!i.soirees && !i.records){
      zone('detail', '<b>' + esc(i.nom) + '</b> : aucun résultat enregistré, la suppression est sans risque.', 'ok');
    } else {
      zone('detail', '<b>' + esc(i.nom) + '</b> : ' + i.soirees + ' soirée(s) jouée(s), ' + i.points +
        ' point(s) au championnat, ' + i.records + ' record(s).', 'warn');
    }
  }).infosJoueur(nom);
}

function demander(){
  if (!INFO) return;
  var perte = (INFO.soirees || INFO.records)
    ? 'Ses résultats (' + INFO.soirees + ' soirée(s), ' + INFO.points + ' point(s)) et ses ' + INFO.records +
      ' record(s) seront <b>définitivement perdus</b>.'
    : 'Il n\\'a aucun résultat enregistré.';
  zone('msg', '⚠️ Supprimer <b>' + esc(INFO.nom) + '</b> ? ' + perte +
    '<div style="margin-top:8px;display:flex;gap:6px">' +
    '<button class="btn" id="oui">Oui, supprimer</button><button class="btn2" id="non">Annuler</button></div>', 'err');
  $('go').disabled = true;
  $('non').onclick = function(){ zone('msg', ''); $('go').disabled = false; };
  $('oui').onclick = function(){
    $('oui').disabled = true; $('non').disabled = true;
    google.script.run.withFailureHandler(erreur).withSuccessHandler(function(txt){
      INFO = null; zone('detail', '');
      zone('msg', '✅ ' + esc(txt), 'ok');
      chargerListe();
    }).supprimerJoueur(INFO.nom);
  };
}
</script>
</body></html>`;

/* ===================== FENÊTRE DE CHANGEMENT DE NOM ===================== */

const HTML_RENOMMAGE = `<!DOCTYPE html>
<html><head><base target="_top">
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1b2224;margin:0;padding:12px 16px}
  label{font-weight:bold;display:block;margin:0 0 6px}
  label.second{margin-top:12px}
  select,input{font-size:13px;padding:4px;width:100%;box-sizing:border-box}
  .aide{color:#888;font-size:11px;margin:6px 0 0}
  .zone{margin-top:12px;padding:8px 10px;border-radius:6px;display:none;line-height:1.4}
  .ok{background:#e6f4ec;color:#1d6b43}.err{background:#fbeaea;color:#a12a22}.warn{background:#fff6e0;color:#7a5600}
  .btn{background:#d4453b;color:#fff;border:0;border-radius:6px;padding:9px 18px;font-size:14px;cursor:pointer}
  .btn:disabled{opacity:.5;cursor:default}
  .btn2{background:#eee;color:#333;border:0;border-radius:6px;padding:8px 12px;cursor:pointer}
  .bas{display:flex;justify-content:space-between;align-items:center;margin-top:14px}
</style></head>
<body>
  <label for="joueur">Joueur à renommer</label>
  <select id="joueur" onchange="choisir()"><option value="">Chargement...</option></select>
  <label for="nouveau" class="second">Nouveau nom</label>
  <input id="nouveau" placeholder="Nouveau nom du joueur" disabled>
  <p class="aide">Ses résultats, points et records sont conservés : seul le nom change
  (championnat, Records BD et onglet Records). Les onglets de poules ne sont pas modifiés.</p>
  <div id="msg" class="zone"></div>
  <div class="bas">
    <button class="btn2" onclick="google.script.host.close()">Fermer</button>
    <button class="btn" id="go" onclick="renommer(false)" disabled>Renommer</button>
  </div>

<script>
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function zone(html, cls){ var z = $('msg'); z.innerHTML = html; z.className = 'zone ' + (cls || ''); z.style.display = html ? 'block' : 'none'; }
function actif(on){ $('go').disabled = !on; $('nouveau').disabled = !on; }
function erreur(e){ actif(!!$('joueur').value); zone(esc(e && e.message ? e.message : String(e)), 'err'); }

function chargerListe(choix){
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(l){
    $('joueur').innerHTML = '<option value="">Choisis un joueur</option>' +
      l.map(function(n){ return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
    if (choix) $('joueur').value = choix;
    $('nouveau').value = $('joueur').value;
    actif(!!$('joueur').value);
  }).listeJoueurs();
}
chargerListe();

function choisir(){
  var nom = $('joueur').value;
  zone('');
  $('nouveau').value = nom;
  actif(!!nom);
  if (nom){ $('nouveau').focus(); $('nouveau').select(); }
}

$('nouveau').addEventListener('keydown', function(e){ if (e.key === 'Enter') renommer(false); });

function renommer(forcer){
  var ancien = $('joueur').value, nouveau = $('nouveau').value.trim();
  if (!ancien) return;
  if (!nouveau){ zone("T'es bidon mec, il faut taper le nouveau nom avant de valider...", 'err'); return; }
  actif(false);
  zone('Changement de nom en cours...', 'warn');
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(res){
    if (!res.renomme){
      zone('⚠️ « ' + esc(res.nom) + ' » ressemble à : <b>' + res.proches.map(esc).join(', ') + '</b>. ' +
        'Est-ce bien le nom voulu ?<div style="margin-top:8px;display:flex;gap:6px">' +
        '<button class="btn2" id="oui">Oui, renommer en « ' + esc(res.nom) + ' »</button>' +
        '<button class="btn2" id="non">Non, annuler</button></div>', 'warn');
      $('oui').onclick = function(){ renommer(true); };
      $('non').onclick = function(){ zone(''); actif(true); };
      return;
    }
    zone('✅ ' + esc(res.message), 'ok');
    chargerListe(res.nom);
  }).renommerJoueur(ancien, nouveau, !!forcer);
}
</script>
</body></html>`;

/* ===================== FENÊTRE « LANCER UN TOURNOI » ===================== */

const HTML_TOURNOI = `<!DOCTYPE html>
<html><head><base target="_top">
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1b2224;margin:0;padding:12px 16px}
  .haut{display:flex;align-items:center;gap:12px;margin-bottom:10px}
  .haut label{font-weight:bold}
  fieldset{border:1px solid #ddd;border-radius:8px;margin:0 0 12px;padding:8px 12px}
  legend{font-weight:bold;padding:0 6px;color:#d4453b}
  .aide{color:#888;font-size:11px;margin:0 0 6px}
  .joueurs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 10px}
  .j{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:5px;cursor:pointer;user-select:none}
  .j.present{background:#e6f4ec}
  select,input{font-size:13px;padding:3px 4px}
  .ajout{display:flex;gap:6px;margin-top:8px}
  .ajout input{flex:1}
  .poules{display:grid;gap:10px}
  .replies{grid-column:1/-1;margin:6px 0 2px;color:#888;font-size:11px}
  .lienrep{background:none;border:0;color:#a12a22;cursor:pointer;padding:0;text-decoration:underline;font-size:12px}
  .poule{border-radius:6px;padding:6px 8px;background:#f6f4ee}
  .poule h4{margin:0 0 4px;color:#d4453b}
  .legs{display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:6px}
  .ligne{display:flex;justify-content:space-between;align-items:center;padding:2px 0}
  .btn{background:#d4453b;color:#fff;border:0;border-radius:6px;padding:9px 18px;font-size:14px;cursor:pointer}
  .btn:disabled{opacity:.5;cursor:default}
  .btn2{background:#eee;color:#333;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}
  .bas{display:flex;justify-content:space-between;align-items:center}
  #msg{margin-top:10px;padding:8px 10px;border-radius:6px;display:none;line-height:1.4}
  .ok{background:#e6f4ec;color:#1d6b43}.err{background:#fbeaea;color:#a12a22}.warn{background:#fff6e0;color:#7a5600}
</style></head>
<body>
  <div class="haut">
    <label for="date">Date</label>
    <input type="date" id="date">
    <span id="encours" class="aide"></span>
  </div>

  <fieldset>
    <legend>1. Joueurs présents</legend>
    <p class="aide">Clique sur les noms des joueurs présents ce soir.</p>
    <div id="joueurs" class="joueurs">Chargement...</div>
    <div class="ajout">
      <input id="nouveau" placeholder="Nouveau joueur (nom)">
      <button class="btn2" onclick="ajouter()">Ajouter</button>
    </div>
    <p class="aide" id="compteur" style="margin-top:6px"></p>
  </fieldset>

  <fieldset>
    <legend>2. Poules</legend>
    <div class="haut" style="margin-bottom:6px">
      <label for="nb">Nombre de poules</label>
      <select id="nb" onchange="NB_CHOISI = true; LEGS_CHOISIS = {}; tirage()"><option>1</option><option>2</option><option>3</option></select>
      <button class="btn2" onclick="tirage()">🎲 Refaire le tirage</button>
    </div>
    <p class="aide" id="reglage"></p>
    <label class="aide" id="grosseBox" style="display:none;color:#1b2224;font-size:13px;margin:0 0 6px">
      <input type="checkbox" id="grosse"> <b>Grosse soirée</b> : les 2 premiers de chaque poule sont qualifiés (6 joueurs) ;
      les deux meilleurs 1ers attendent en demi-finale, les quatre autres jouent les quarts.</label>
    <p class="aide">Tirage au sort automatique. Pour déplacer un joueur, change sa poule dans la liste.
    Par défaut, la plus petite poule joue en 3 legs gagnants (si les poules n'ont pas la même taille).</p>
    <div id="poules" class="poules"></div>
    <div class="haut" style="margin:10px 0 0">
      <label for="legsF">Phase finale</label>
      <select id="legsF"></select>
    </div>
  </fieldset>

  <div class="bas">
    <button class="btn2" onclick="google.script.host.close()">Fermer</button>
    <button class="btn" id="go" onclick="lancer(false)">Lancer le tournoi</button>
  </div>
  <div id="msg"></div>

<script>
var JOUEURS = [], PRESENTS = {}, AFFECT = {}, S2 = 7, S3 = 13, NB_CHOISI = false, LEGS_CHOISIS = {};
var VENUES = {}, HABITUES = 6, TOUS = false;
var LETTRES = "ABC";
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function message(html, cls){ var m = $('msg'); m.innerHTML = html; m.className = cls; m.style.display = html ? 'block' : 'none'; }
function erreur(e){ $('go').disabled = false; message(esc(e && e.message ? e.message : String(e)), 'err'); }

google.script.run.withSuccessHandler(init).withFailureHandler(erreur).donneesTournoi();

function init(d){
  JOUEURS = d.joueurs; S2 = d.seuil2; S3 = d.seuil3;
  VENUES = d.venues || {}; HABITUES = d.habitues || 6;
  $('date').value = d.date;
  $('date').onchange = dessinerJoueurs;
  if (d.enCours) $('encours').textContent = "(l'onglet Tournoi contient le tournoi du " + d.enCours.split('-').reverse().join('/') + ")";
  $('legsF').innerHTML = optionsLegs(2);
  $('reglage').textContent = 'Réglage : 2 poules dès ' + S2 + ' joueurs, 3 poules dès ' + S3 + ' (menu Réglages du tournoi).';
  dessinerJoueurs();
}

function presents(){ return JOUEURS.filter(function(n){ return PRESENTS[n]; }); }

/* Joueur affiché d'office : présent, jamais venu, ou venu dans les HABITUES dernières semaines avant la date du tournoi */
function habitue(n){
  if (PRESENTS[n] || !VENUES[n]) return true;
  var p = ($('date').value || '').split('-').map(Number);
  var d = p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : new Date();
  d.setDate(d.getDate() - 7 * HABITUES);
  var lim = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  return VENUES[n] >= lim;
}

function dessinerJoueurs(){
  var box = $('joueurs'); box.innerHTML = '';
  var autres = JOUEURS.filter(function(n){ return !habitue(n); });
  var liste = JOUEURS.filter(habitue);
  if (TOUS) liste = liste.concat(autres);
  liste.forEach(function(n, i){
    if (TOUS && autres.length && i === liste.length - autres.length){
      var t = document.createElement('p'); t.className = 'replies';
      t.textContent = 'Pas venus depuis plus de ' + HABITUES + ' semaines :'; box.appendChild(t);
    }
    var div = document.createElement('div');
    div.className = 'j' + (PRESENTS[n] ? ' present' : '');
    div.innerHTML = '<b class="case">' + (PRESENTS[n] ? '☑' : '☐') + '</b> <span>' + esc(n) + '</span>';
    div.onclick = function(){
      PRESENTS[n] = !PRESENTS[n];
      div.className = 'j' + (PRESENTS[n] ? ' present' : '');
      div.querySelector('.case').textContent = PRESENTS[n] ? '☑' : '☐';
      changement();
    };
    box.appendChild(div);
  });
  if (autres.length){
    var b = document.createElement('p'); b.className = 'replies';
    b.innerHTML = '<button type="button" class="lienrep">' + (TOUS ? 'Replier les anciens joueurs'
      : (autres.length > 1 ? 'Voir les ' + autres.length + ' autres joueurs (pas venus' : "Voir l'autre joueur (pas venu") + ' depuis plus de ' + HABITUES + ' semaines)') + '</button>';
    b.querySelector('button').onclick = function(){ TOUS = !TOUS; dessinerJoueurs(); };
    box.appendChild(b);
  }
  changement();
}

function optionsLegs(choisi){
  var o = '';
  for (var i = 1; i <= 5; i++) o += '<option value="' + i + '"' + (i === choisi ? ' selected' : '') + '>' + i + ' leg' + (i > 1 ? 's' : '') + ' gagnant' + (i > 1 ? 's' : '') + '</option>';
  return o;
}

function taillesPoules(){
  var k = Number($('nb').value), t = [];
  for (var p = 0; p < k; p++) t.push(presents().filter(function(n){ return AFFECT[n] === p; }).length);
  return t;
}

// 3 legs gagnants pour la ou les plus petites poules si les tailles diffèrent, sinon 2
function legsAuto(p){
  var t = taillesPoules(), min = Math.min.apply(null, t), max = Math.max.apply(null, t);
  return (t.length > 1 && min < max && t[p] === min) ? 3 : 2;
}
function legsPoule(p){ return LEGS_CHOISIS[p] || legsAuto(p); }

function nbAuto(n){ return n >= S3 ? 3 : n >= S2 ? 2 : 1; }

function changement(){
  var n = presents().length;
  $('compteur').textContent = n + ' joueur(s) présent(s)';
  if (!NB_CHOISI && $('nb').value !== String(nbAuto(n))){ $('nb').value = String(nbAuto(n)); LEGS_CHOISIS = {}; }
  tirage();
}

function melanger(t){ for (var i = t.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)); var x = t[i]; t[i] = t[j]; t[j] = x; } return t; }

function tirage(){
  var k = Number($('nb').value);
  AFFECT = {};
  melanger(presents().slice()).forEach(function(n, i){ AFFECT[n] = i % k; });
  dessinerPoules();
}

function dessinerPoules(){
  var k = Number($('nb').value), box = $('poules');
  $('grosseBox').style.display = k === 3 ? 'block' : 'none';
  box.style.gridTemplateColumns = 'repeat(' + k + ', 1fr)';
  box.innerHTML = '';
  if (!presents().length){ box.innerHTML = '<p class="aide">Coche les joueurs présents.</p>'; return; }
  for (var p = 0; p < k; p++){
    var noms = presents().filter(function(n){ return AFFECT[n] === p; });
    var div = document.createElement('div'); div.className = 'poule';
    div.innerHTML = '<h4>Poule ' + LETTRES[p] + ' (' + noms.length + ')</h4>' +
      '<div class="legs"><select class="sel-legs" data-p="' + p + '">' + optionsLegs(legsPoule(p)) + '</select></div>' + noms.map(function(n){
      var opts = ''; for (var q = 0; q < k; q++) opts += '<option value="' + q + '"' + (q === p ? ' selected' : '') + '>' + LETTRES[q] + '</option>';
      return '<div class="ligne"><span>' + esc(n) + '</span><select data-nom="' + esc(n) + '">' + opts + '</select></div>';
    }).join('');
    box.appendChild(div);
  }
  box.querySelectorAll('select[data-nom]').forEach(function(s){ s.onchange = function(){ AFFECT[s.dataset.nom] = Number(s.value); dessinerPoules(); }; });
  box.querySelectorAll('select.sel-legs').forEach(function(s){ s.onchange = function(){ LEGS_CHOISIS[Number(s.dataset.p)] = Number(s.value); }; });
}

function ajouter(forcer){
  var nom = $('nouveau').value.trim();
  if (!nom){ message("T'es bidon mec, il faut taper le nom avant de valider...", 'err'); return; }
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(res){
    if (!res.ajoute){
      message('⚠️ « ' + esc(res.nom) + ' » ressemble à : <b>' + res.proches.map(esc).join(', ') + '</b>. Est-ce bien un nouveau joueur ?' +
        '<div style="margin-top:6px;display:flex;gap:6px"><button class="btn2" id="oui">Oui, ajouter</button><button class="btn2" id="non">Non, annuler</button></div>', 'warn');
      $('oui').onclick = function(){ ajouter(true); };
      $('non').onclick = function(){ $('nouveau').value = ''; message('Ajout annulé : coche plutôt le nom existant.', 'ok'); };
      return;
    }
    JOUEURS.push(res.nom); PRESENTS[res.nom] = true; $('nouveau').value = '';
    dessinerJoueurs();
    message('« ' + esc(res.nom) + ' » est ajouté au championnat et marqué présent.', 'ok');
  }).ajouterJoueur(nom, !!forcer);
}

function lancer(remplacer){
  var k = Number($('nb').value), poules = [], legs = [];
  for (var p = 0; p < k; p++){ poules.push(presents().filter(function(n){ return AFFECT[n] === p; })); legs.push(legsPoule(p)); }
  $('go').disabled = true;
  message('Création du tournoi...', 'warn');
  google.script.run.withFailureHandler(erreur).withSuccessHandler(function(r){
    if (r.confirmer){
      message('⚠️ ' + esc(r.confirmer) + '<div style="margin-top:6px;display:flex;gap:6px"><button class="btn" id="oui">Oui, remplacer</button><button class="btn2" id="non">Annuler</button></div>', 'warn');
      $('oui').onclick = function(){ lancer(true); };
      $('non').onclick = function(){ message('', ''); $('go').disabled = false; };
      return;
    }
    message('✅ ' + esc(r.message) + ' Tu peux fermer cette fenêtre.', 'ok');
  }).lancerTournoi({ date: $('date').value, poules: poules, legs: legs, legsFinale: Number($('legsF').value), grosse: k === 3 && $('grosse').checked, remplacer: !!remplacer });
}
</script>
</body></html>`;
