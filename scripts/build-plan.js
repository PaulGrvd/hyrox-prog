#!/usr/bin/env node
/**
 * build-plan.js — generate prepa_hyrox_bordeaux_solo_open.csv from structured tables.
 *
 * The CSV is the source of truth for the app, but the whole 14-week plan is encoded
 * here so it can be re-tuned coherently (loads, progressions, session design) without
 * hand-editing 98 rows. Hand-edits to the CSV are fine and are only overwritten if you
 * re-run this script.
 *
 * Built for HYROX Men's Open. Race: Sat 2026-10-03 (HYROX Bordeaux Solo Open).
 * Run:  node scripts/build-plan.js   (then: node scripts/refresh-data.js)
 *
 * Weekly template (recovery-aware):
 *   Lun Force jambes · Mar Golf/récup · Mer Running seuil/intervalles ·
 *   Jeu Force haut+stations · Ven Zone 2 · Sam HYROX · Dim Golf long/repos
 *   (heavy legs Mon are followed by an easy golf/recovery day before Wed intervals)
 */
const fs = require("fs");
const path = require("path");

const HEADER = "Date,Jour,Semaine,Bloc,Focus semaine,Type séance,Séance prévue,Durée prévue,RPE cible,Priorité,Fait ?,Durée réelle,RPE réel,Sommeil /10,Fatigue jambes /10,Douleur /10,Golf joué ?,Score ou ressenti golf,Notes / splits";
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// ---- Run paces calibrated to the race goal -------------------------------------------
// Goal: HYROX Solo Open in 1h00. The race is 8x1 km run (~8 km) + 8 stations + roxzone.
// Budget for 60:00 ≈ 34 min running (8 km @ ~4:15/km) + ~26 min stations & transitions.
// So target race-run pace = 4:15/km; threshold sits a touch faster, intervals faster still.
// To re-tune for a different goal, change these and re-run the script.
const GOAL = "1h00";
const PACE = {
  race:  "4:15/km",   // allure course HYROX visée  (1 km 4:15 · 800 m 3:24 · 2 km 8:30)
  seuil: "4:00/km",   // seuil / allure 10 km        (1 km 4:00 · 800 m 3:12 · 2 km 8:00 · 1200 m 4:48)
  z2:    "5:15-5:45/km", // endurance facile, conversationnelle
};

function block(w) {
  if (w <= 4)  return ["Bloc 1 - Base moteur + force jambes", "Zone 2, force lourde, technique stations"];
  if (w <= 8)  return ["Bloc 2 - Seuil + endurance musculaire", "Seuil running, jambes sous fatigue, ateliers modérés"];
  if (w <= 12) return ["Bloc 3 - Spécifique HYROX", "Enchaînements course + stations, pacing, simulations, back-half sous fatigue"];
  return ["Bloc 4 - Taper / affûtage", "Réduire volume, garder intensité, fraîcheur"];
}

// ---- Lundi · Force jambes  [seance, durée, rpe, note] ----
const N1RM = "Charges sur 1RM estimés (squat 145, bench 135, deadlift 165 kg) — à ajuster au ressenti. Sled = poids total, traîneau inclus. Jamais à l'échec.";
const leg = {
  1:  ["Back squat 5x5 @105 kg + Romanian deadlift 4x6 @90 kg + Bulgarian split squat 3x8/jambe 2x20 kg + finisher 2x20 walking lunges sandbag 20 kg + gainage 3x45s", "55-65 min", "7-8", N1RM],
  2:  ["Back squat 5x5 @107.5 kg + Romanian deadlift 4x6 @92.5 kg + Bulgarian split squat 3x8/jambe 2x22.5 kg + finisher 2x20 walking lunges sandbag 20 kg + gainage 3x45s", "55-65 min", "7-8", "Lourd mais 2-3 reps en réserve, technique propre"],
  3:  ["Back squat 5x5 @110 kg + Romanian deadlift 4x6 @95 kg + Bulgarian split squat 3x8/jambe 2x22.5 kg + finisher 2x20 walking lunges sandbag 20 kg + gainage 3x45s", "55-65 min", "7-8", "Qualité technique, jambes solides sans échec"],
  4:  ["Décharge: Back squat 3x5 @92.5 kg tempo 3s + Romanian deadlift 3x6 @80 kg + Bulgarian split squat 2x8/jambe 2x17.5 kg + mobilité hanches 10 min", "45-55 min", "5-6", "Semaine de décharge: garder 3-4 reps en réserve"],
  5:  ["Back squat 5x5 @110 kg + Romanian deadlift 4x6 @97.5 kg + Bulgarian split squat 3x8/jambe 2x24 kg + finisher 2x20 walking lunges sandbag 20 kg + gainage 3x45s", "55-65 min", "7-8", "Reprise après décharge"],
  6:  ["Back squat 5x5 @112.5 kg + Romanian deadlift 4x6 @100 kg + Bulgarian split squat 3x8/jambe 2x24 kg + finisher 2x20 walking lunges sandbag 20 kg + gainage 3x45s", "55-65 min", "7-8", "5x5 plafonné à ~78% du 1RM"],
  7:  ["Back squat 5x4 @115 kg + Romanian deadlift 4x6 @102.5 kg + Bulgarian split squat 3x8/jambe 2x26 kg + finisher 2x20 walking lunges sandbag 20 kg + gainage 3x45s", "55-65 min", "7-8", "5x4: charge un peu plus lourde, contrôle total"],
  8:  ["Décharge: Back squat 3x5 @95 kg tempo 3s + Romanian deadlift 3x6 @85 kg + Bulgarian split squat 2x8/jambe 2x20 kg + mobilité hanches 10 min", "45-55 min", "5-6", "Décharge: fraîcheur avant Bloc 3"],
  9:  ["Back squat 5x5 @112.5 kg + Romanian deadlift 4x6 @102.5 kg + Bulgarian split squat 3x8/jambe 2x24 kg + finisher 2x20 walking lunges sandbag 20 kg", "55-65 min", "7-8", "Maintenir la force pendant le bloc spécifique"],
  10: ["Back squat 5x3 @122.5 kg (pic de force) + Romanian deadlift 4x6 @105 kg + Bulgarian split squat 3x8/jambe 2x26 kg + finisher 2x20 walking lunges sandbag 20 kg", "55-65 min", "7-8", "Pic de force du programme: triples lourds, explosif au concentrique"],
  11: ["Back squat 4x4 @115 kg + Romanian deadlift 4x6 @107.5 kg + Bulgarian split squat 3x8/jambe 2x26 kg + finisher 2x16 walking lunges sandbag 20 kg", "50-60 min", "7", "Force modérée: priorité à la simulation complète de samedi"],
  12: ["Décharge: Back squat 3x3 @100 kg vitesse + Romanian deadlift 3x6 @87.5 kg + Bulgarian split squat 2x8/jambe 2x20 kg + mobilité 10 min", "40-50 min", "5-6", "Décharge: vitesse, fraîcheur, début d'affûtage"],
  13: ["Taper: Back squat 3x3 @90 kg vitesse max + Romanian deadlift 3x5 @85 kg + 2x20 walking lunges sandbag 20 kg + mollets 2x20", "35-45 min", "5-6", "Taper: vif et frais, aucune courbature"],
  14: ["Activation: Back squat 3x3 @72.5 kg vitesse max + Romanian deadlift 2x5 @70 kg + 2x12 walking lunges + mollets 2x15", "35-45 min", "5-6", "J-5: léger et explosif, sortir frais"],
};

// ---- Mercredi · Running seuil / intervalles (course PURE, pas de stations) ----
const run = {
  1:  [`Échauffement 15 min + éducatifs 4x60 m + 6x800 m allure 10 km ${PACE.seuil} (800 m en ~3:12), récup 2 min trot + 8 min retour au calme`, "50-65 min", "7-8", `Objectif ${GOAL}: tenir ~3:12 au 800 m. Noter le split moyen`],
  2:  [`Échauffement 15 min + 7x800 m allure 10 km ${PACE.seuil} (~3:12), récup 2 min trot + 8 min easy`, "50-65 min", "7-8", "Régularité des splits, même temps du 1er au dernier"],
  3:  [`Échauffement 15 min + 4x1200 m allure seuil ${PACE.seuil} (1200 m en ~4:48), récup 2 min 30 + 8 min easy`, "50-65 min", "7-8", "Allure contrôlée, pas de sprint"],
  4:  ["Décharge: Échauffement 12 min + 6x400 m souple, récup 90s + 10 min easy", "40-50 min", "5-6", "Vivacité sans fatigue"],
  5:  [`Échauffement 15 min + 3x2 km allure seuil ${PACE.seuil} (2 km en ~8:00), récup 3 min + 6x100 m relâchés`, "55-70 min", "7-8", "Seuil: finir capable d'une rep de plus"],
  6:  [`Échauffement 15 min + 2x3 km allure seuil ${PACE.seuil} (3 km en ~12:00), récup 3 min + 6x100 m`, "55-70 min", "7-8", "Seuil prolongé, allure régulière"],
  7:  [`Échauffement 15 min + 5x1 km allure seuil ${PACE.seuil} (1 km en ~4:00), récup 2 min + 6x100 m`, "55-70 min", "7-8", "Splits réguliers ~4:00"],
  8:  ["Décharge: Échauffement 12 min + 6x400 m souple, récup 90s + 10 min easy", "40-50 min", "5-6", "Décharge"],
  9:  [`Échauffement 15 min + 5x1 km allure course HYROX ${PACE.race} (1 km en ~4:15), récup 1 min + 8 min easy`, "50-65 min", "7-8", `Allure ${PACE.race} = allure des 8 km du jour J (objectif ${GOAL}). 8 km ≈ 34 min, le reste pour les stations`],
  10: [`Échauffement 15 min + 6x1 km allure course HYROX ${PACE.race} (~4:15), récup 1 min + 6 min easy`, "55-70 min", "8", "Tenir 4:15 jusqu'au dernier, sans accélérer"],
  11: [`Échauffement 15 min + 3x2 km allure course HYROX ${PACE.race} (2 km en ~8:30), récup 2 min + 6x100 m`, "55-70 min", "7-8", "Allure course sur portions longues (grosse sim samedi)"],
  12: ["Décharge: Échauffement 12 min + 5x400 m souple, récup 90s + 8 min easy", "40-50 min", "5-6", "Décharge avant taper"],
  13: [`Taper: Échauffement 12 min + 4x1 km allure course HYROX ${PACE.race} (~4:15), récup 90s + 4x80 m vifs`, "40-50 min", "6-7", "Affûtage: ancrer 4:15/km, rester frais"],
  14: ["Activation: Échauffement 12 min + 3x1 min allure course, récup 2 min + 4x100 m relâchés", "30-40 min", "4-5", "Activation, zéro dette lactique"],
};

// ---- Jeudi · Force haut + stations ----
const upper = {
  1:  ["Tractions strictes 4x6-8 (lest si possible) + développé couché 4x6 @92.5 kg + rowing barre 4x8 @70 kg + sled push 6x15 m total 120 kg + sled pull 6x15 m total 80 kg + farmer carry 4x40 m 2x24 kg", "55-70 min", "7-8", "Sled: push hanches basses/pas courts; pull bras longs/buste gainé"],
  2:  ["Tractions strictes 4x6-8 + développé couché 4x6 @95 kg + rowing barre 4x8 @72.5 kg + sled push 6x15 m total 125 kg + sled pull 6x15 m total 85 kg + farmer carry 4x40 m 2x24 kg", "55-70 min", "7-8", "Qualité avant vitesse"],
  3:  ["Tractions strictes 4x6-8 + développé couché 4x6 @97.5 kg + rowing barre 4x8 @75 kg + sled push 6x15 m total 130 kg + sled pull 6x15 m total 90 kg + farmer carry 4x40 m 2x24 kg", "55-70 min", "7-8", "Stations lourdes propres"],
  4:  ["Décharge: Tractions 3x6 + développé couché 3x6 @82.5 kg + rowing 3x8 @65 kg + sled push technique 4x15 m total 115 kg + sled pull 4x15 m total 75 kg + farmer 3x40 m 2x24 kg", "45-55 min", "5-6", "Décharge: technique sled, récup complète"],
  5:  ["Tractions strictes 4x8 + développé couché 4x6 @97.5 kg + rowing barre 4x8 @77.5 kg + sled push 6x15 m total 135 kg + sled pull 6x15 m total 92 kg + farmer carry 4x40 m 2x24 kg + 4x15 wall balls 6 kg", "55-70 min", "7-8", "Ajout wall balls en fin de séance"],
  6:  ["Tractions strictes 4x8 + développé couché 4x6 @100 kg + rowing barre 4x8 @80 kg + sled push 6x15 m total 140 kg + sled pull 6x15 m total 95 kg + farmer carry 4x40 m 2x24 kg + 4x15 wall balls 6 kg", "55-70 min", "7-8", "Stations sous fatigue"],
  7:  ["Tractions strictes 4x8 + développé couché 4x6 @102.5 kg + rowing barre 4x8 @82.5 kg + sled push 6x15 m total 145 kg + sled pull 6x15 m total 100 kg + farmer carry 5x40 m 2x24 kg + 5x15 wall balls 6 kg", "55-70 min", "7-8", "Pic de Bloc 2 sur les stations"],
  8:  ["Décharge: Tractions 3x6 + développé couché 3x6 @85 kg + rowing 3x8 @70 kg + sled push 4x15 m total 130 kg + sled pull 4x15 m total 88 kg + farmer 3x40 m 2x24 kg", "45-55 min", "5-6", "Décharge"],
  9:  ["Tractions lestées 4x6 + développé couché 4x5 @105 kg + rowing barre 4x8 @82.5 kg + sled push 6x20 m total 150 kg + sled pull 6x20 m total 100 kg + farmer carry 4x50 m 2x24 kg + 5x15 wall balls 6 kg", "55-70 min", "7-8", "Charges stations proches de la course"],
  10: ["Tractions lestées 4x5 + développé couché 4x4 @110 kg (pic) + rowing barre 4x8 @85 kg + sled push 6x20 m total 158 kg (surcharge) + sled pull 6x20 m total 106 kg + farmer carry 4x50 m 2x24 kg + 5x20 wall balls 6 kg", "55-70 min", "7-8", "Pic haut du corps + surcharge sled au-dessus de la course"],
  11: ["Tractions lestées 4x5 + développé couché 4x5 @105 kg + rowing barre 4x8 @85 kg + sled push 6x20 m total 152 kg (poids course) + sled pull 6x20 m total 103 kg (poids course) + farmer carry 4x50 m 2x24 kg", "55-70 min", "7-8", "Poids exacts de course, technique de compétition"],
  12: ["Décharge: Tractions 3x6 + développé couché 3x4 @90 kg + rowing 3x8 @72.5 kg + sled push 4x15 m total 130 kg + sled pull 4x15 m total 85 kg + farmer 3x40 m 2x24 kg", "45-55 min", "5-6", "Décharge"],
  13: ["Taper: Tractions 3x5 + développé couché 3x4 @85 kg + rowing 3x8 @70 kg + sled push technique 4x15 m total 130 kg + sled pull 4x15 m total 85 kg + farmer 3x40 m 2x24 kg", "40-50 min", "5-6", "Activation, zéro échec"],
  14: ["Activation J-2: Tractions 2x5 + développé couché 3x4 @67.5 kg + sled push 4x12 m total 80 kg + sled pull 4x12 m total 60 kg + farmer 2x40 m 2x24 kg", "35-45 min", "4-5", "Très léger, garde-le court"],
};

// ---- Samedi · HYROX spécifique (W14 = RACE, géré à part) ----
const hyrox = {
  1:  ["HYROX technique 4 tours: 1 km run RPE6 + SkiErg 500 m + 20 wall balls 6 kg cible 3 m + 20 sandbag lunges 20 kg. Récup 2 min entre tours", "55-65 min", "6-7", "Apprendre l'enchaînement. Wall ball: squat complet, lancer fluide; lunges: genou au sol, buste haut"],
  2:  ["4 tours: 1 km run + SkiErg 500 m + 20 wall balls 6 kg cible 3 m + 20 sandbag lunges 20 kg. Pacing régulier", "55-65 min", "6-7", "Noter splits run et stations"],
  3:  ["4 tours: 1 km run + row 500 m + 12 burpee broad jumps + 20 wall balls 6 kg. Transitions propres", "55-70 min", "7", "Introduit row + burpees broad jumps"],
  4:  ["Décharge — mini-Hyrox 3 tours faciles: 800 m run + SkiErg 250 m + 15 wall balls 6 kg + farmer carry 40 m 2x24 kg. Récup complète", "40-50 min", "5-6", "Fluidité, RPE bas"],
  5:  [`5 tours: 1 km run allure course ${PACE.race} + sled push 15 m total 135 kg + sled pull 15 m total 92 kg + row 250 m. Transitions calmes`, "65-80 min", "7-8", `Tenir ${PACE.race} sur le run malgré les jambes (objectif ${GOAL})`],
  6:  ["5 tours: 1 km run + 12 burpee broad jumps + row 250 m + 20 wall balls 6 kg. Pacing constant", "65-80 min", "7-8", "Endurance musculaire"],
  7:  ["4 tours: 1 km run + sled push 25 m total 145 kg + sled pull 25 m total 100 kg + 15 burpee broad jumps + 25 wall balls 6 kg", "65-80 min", "7-8", "Stations lourdes enchaînées"],
  8:  ["Test 4 stations à froid mais frais + 1 km run + sled push 50 m total 130 kg + 1 km run + sled pull 50 m total 88 kg + 1 km run + burpee broad jump 80 m + 1 km run + row 1000 m + chrono continu", "65-80 min", "8", "Benchmark fin de Bloc 2: noter temps total + tous les splits"],
  9:  [`Simulation 6 stations dans l'ordre à ~85% allure course ${PACE.race} + 1 km run + SkiErg 1000 m + 1 km run + sled push 50 m total 150 kg + 1 km run + sled pull 50 m total 100 kg + 1 km run + burpee broad jump 80 m + 1 km run + row 1000 m + 1 km run + farmer carry 200 m 2x24 kg + chrono continu`, "85-105 min", "8", `Run à ${PACE.race}, transitions < 45 s`],
  10: [`Back-half: répète la fin de course sous fatigue + 1 km run ${PACE.race} + row 1000 m + 1 km run + farmer carry 200 m 2x24 kg + 1 km run + sandbag lunges 100 m 20 kg + 100 wall balls 6 kg cible 3 m en 20/20/15/15/10/10 + chrono continu`, "70-90 min", "8-9", `Lunges 100 m + 100 wall balls; garder le run à ${PACE.race} entre les stations`],
  11: [`Simulation complète 8 stations dans l'ordre à ~90-95% allure course ${PACE.race} (run ~4:15/km) + 1 km run + SkiErg 1000 m + 1 km run + sled push 50 m total 152 kg + 1 km run + sled pull 50 m total 103 kg + 1 km run + burpee broad jump 80 m + 1 km run + row 1000 m + 1 km run + farmer carry 200 m 2x24 kg + 1 km run + sandbag lunges 100 m 20 kg + 1 km run + 100 wall balls 6 kg cible 3 m + chrono continu`, "80-100 min", "9", `Pic de prépa: chrono cible ≈ ${GOAL}. Tester pacing ${PACE.race}, nutrition, hydratation, transitions comme le jour J`],
  12: [`Décharge mini-sim fluide 3 tours + 800 m run allure course ${PACE.race} + SkiErg 300 m + 12 wall balls 6 kg + farmer carry 60 m 2x24 kg + récup complète`, "35-45 min", "6", "Fraîcheur, sensations, pas de mise dans le rouge"],
  13: [`Primer course 3 tours: 800 m run allure course ${PACE.race} + SkiErg 250 m + 10 wall balls 6 kg + 8 burpee broad jumps. Récup complète, sensations de vitesse, zéro lactate`, "35-45 min", "5-6", `Affûtage J-7: ancrer ${PACE.race}`],
};

const RACE = [`HYROX Bordeaux Solo Open (Men's Open) — objectif ${GOAL}. Échauffement 20 min: footing 8 min + mobilité + 3 accélérations + 8 wall balls d'activation. Plan de course: 8 runs à ${PACE.race} (8 km ≈ 34 min, ne pas partir plus vite sur Run 1-2), SkiErg régulier, sled push/pull sans arrêt long, burpees au rythme, relance progressive après Row puis Farmer, sandbag lunges en contrôle, wall balls en séries 20/20/15/15/10/10/10. ~26 min pour stations + roxzone. Hydratation + respiration.`, "90-120 min", "9-10", `Objectif ${GOAL}: viser ${PACE.race} au km. Renseigner chrono total + 8 splits 1 km + temps par station`];

// ---- Constants for the easy/recovery days ----
const golfTue = ["9 trous ou practice technique golf 60-90 min + mobilité hanches/dos 15 min + respiration 5 min. Récup active: jambes légères, pas de cardio intense", "60-120 min", "3-4", "Récupération entre lourde (lun) et intervalles (mer)"];
const golfSun = ["18 trous si prévu, sinon repos complet + marche 30 min + mobilité 12 min mollets/quads/hanches. Si fatigue jambes >7/10: repos prioritaire", "0-240 min", "2-4", "Ne pas compenser par un WOD"];
const Z2 = { 1:50, 2:55, 3:60, 4:40, 5:55, 6:60, 7:65, 8:45, 9:60, 10:65, 11:55, 12:45, 13:35, 14:25 };
function zone2(w) {
  const d = Z2[w];
  const deload = (w === 4 || w === 8 || w === 12);
  const strides = deload ? "" : " + 6x20s lignes droites";
  return [`Course Zone 2 ${d} min allure facile ~${PACE.z2}, conversationnelle/FC basse${strides}. Mobilité mollets/ischios 10 min`, `${d + 10} min`, "4-5", "Moteur aérobie + récup. Rester lent: ne pas dériver vers le seuil"];
}

// dow → [type, priorité, table-getter]
function session(dow, w) {
  switch (dow) {
    case 0: return ["Force jambes", "A", leg[w]];
    case 1: return ["Golf / récup active", "C", golfTue];
    case 2: return ["Running seuil / intervalles", "A", run[w]];
    case 3: return ["Force haut + stations", "A", upper[w]];
    case 4: return ["Zone 2", "A", zone2(w)];
    case 5: return w === 14 ? ["RACE", "A", RACE] : ["HYROX spécifique", "A", hyrox[w]];
    case 6: return ["Golf long / repos", "B", golfSun];
  }
}

function csvField(v) {
  v = String(v == null ? "" : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

const start = Date.UTC(2026, 5, 29); // 2026-06-29 (Lundi, week 1)
const lines = [HEADER];
for (let i = 0; i < 98; i++) {
  const d = new Date(start + i * 86400000);
  const date = d.toISOString().slice(0, 10);
  const jour = JOURS[i % 7];
  const week = Math.floor(i / 7) + 1;
  const [bloc, focus] = block(week);
  const [type, prio, tbl] = session(i % 7, week);
  const [seance, duree, rpe, note] = tbl;
  const row = [date, jour, String(week), bloc, focus, type, seance, duree, rpe, prio,
    "", "", "", "", "", "", "", "", note];
  lines.push(row.map(csvField).join(","));
}

const out = path.resolve(__dirname, "..", "prepa_hyrox_bordeaux_solo_open.csv");
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`Wrote ${out}\nSessions: 98 | columns: ${HEADER.split(",").length}`);
