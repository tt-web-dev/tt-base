// Shared TT-Kickbase scoring (Punktetabelle). Single source of truth,
// required by server.js and mytt-player.js. Do not duplicate logic elsewhere.

//----------Punktetabelle------------
const Punkte = [0.5, -0.5, 8, -3, 25, -10, 10, -10, 2, -2, 5, 10, 15, 10, 15, -10, 40, 100, 15, 20, -3, -5, -15, -40, 50, 125, 50, 125, 30, 40];
//^^^^^^^^^^Punktetabelle^^^^^^^^^^^^
let global_swc;
let global_slc;
let global_gwc;

function getDScore(game, side) {

  return (getEScore(game, side)/2);
}

function getEScore(game, side) {
  let escore = 0;
  var swc = 0; //set win counter
  var slc = 0; //set loss counter
  var e1_1 = parseInt(game.set1_home);
  var e1_2 = parseInt(game.set1_guest);
  var e2_1 = parseInt(game.set2_home);
  var e2_2 = parseInt(game.set2_guest);
  var e3_1 = parseInt(game.set3_home);
  var e3_2 = parseInt(game.set3_guest);
  var e4_1 = parseInt(game.set4_home);
  var e4_2 = parseInt(game.set4_guest);
  var e5_1 = parseInt(game.set5_home);
  var e5_2 = parseInt(game.set5_guest);
  if(game.game_type == "double"){
    var TTR1_1 = parseInt(game.mm_player11.fed_rank);
    var TTR1_2 = parseInt(game.mm_player12.fed_rank);
    var TTR2_1 = parseInt(game.mm_player21.fed_rank);
    var TTR2_2 = parseInt(game.mm_player22.fed_rank);
    var TTR1 = Math.round((TTR1_1+TTR1_2)/2);
    var TTR2 = Math.round((TTR2_1+TTR2_2)/2);
  }
  else{
    var TTR1 = parseInt(game.mm_player11.fed_rank);
    var TTR2 = parseInt(game.mm_player21.fed_rank);
  }


  if (side == "away") {
    //swap the values of home and guest sets and ttr
    [e1_2, e1_1] = [e1_1, e1_2];
    [e2_2, e2_1] = [e2_1, e2_2];
    [e3_2, e3_1] = [e3_1, e3_2];
    [e4_2, e4_1] = [e4_1, e4_2];
    [e5_2, e5_1] = [e5_1, e5_2];
    [TTR2, TTR1] = [TTR1, TTR2];
  }

  //each single point
  escore += Punkte[0]*(e1_1+e2_1+e3_1+e4_1+e5_1);
  escore += Punkte[1]*(e1_2+e2_2+e3_2+e4_2+e5_2);
  //the sets
  if(e1_1>e1_2){
    escore += Punkte[2];
    swc++;
    if(e1_2==0 || e1_2==1 || e1_2==2){
      escore += Punkte[10];
    }
  }
  else{
    escore += Punkte[3];
    slc++;
  }
  if(e2_1>e2_2){
    escore += Punkte[2];
    swc++;
    if(e2_2==0 || e2_2==1 || e2_2==2){
      escore += Punkte[10];
    }
  }
  else{
    escore += Punkte[3];
    slc++;
  }
  if(e3_1>e3_2){
    escore += Punkte[2];
    swc++;
    if(e3_2==0 || e3_2==1 || e3_2==2){
      escore += Punkte[10];
    }
  }
  else{
    escore += Punkte[3];
    slc++;
  }
  if(e4_1>e4_2){
    escore += Punkte[2];
    swc++;
    if(e4_2==0 || e4_2==1 || e4_2==2){
      escore += Punkte[10];
    }
  }
  else if(e4_1<e4_2){
    escore += Punkte[3];
    slc ++;
  }
  if(e5_1>e5_2){
    escore += Punkte[2];
    swc++;
    if(e5_2==0 || e5_2==1 || e5_2==2){
      escore += Punkte[10];
    }
  }
  else if(e5_1<e5_2){
    escore += Punkte[3];
    slc++;
  }
  //the match
  if(swc>slc){
    escore += Punkte[4];
  }
  else{
    escore += Punkte[5];
  }
  //Dominanz-Bonus
  if(swc==3 && slc==0){
    escore += Punkte[6];
  }
  else if(swc==0 && slc==3){
    escore += Punkte[7];
  }
  else if(swc==3 && slc==1){
    escore += Punkte[8];
  }
  else if(swc==1 && slc==3){
    escore += Punkte[9];
  }

  //Mental-Bonus
  //Verlänergungssatz
  if(e1_1>e1_2 && e1_1>11){
    escore += Punkte[11];
  }
  if(e2_1>e2_2 && e2_1>11){
    escore += Punkte[11];
  }
  if(e3_1>e3_2 && e3_1>11){
    escore += Punkte[11];
  }
  if(e4_1>e4_2 && e4_1>11){
    escore += Punkte[11];
  }
  if(e5_1>e5_2 && e5_1>11){
    escore += Punkte[11];
  }
  //Entscheidungssatz (5ter Satz gewonnen)
  if(swc == 3 && slc == 2){
    escore += Punkte[12];
  }
  //0:2 zu 2:2 (Comeback)
  if(e1_1<e1_2 && e2_1<e2_2 && e3_1>e3_2 && e4_1>e4_2){
    escore += Punkte[13];
  }
  //mit 0:2 gewonnen (Reverse Sweep)
  if(e1_1<e1_2 && e2_1<e2_2 && e3_1>e3_2 && e4_1>e4_2 && e5_1>e5_2){
    escore += Punkte[14];
  }
  //mit 2:0 verloren (Choke)
  if(e1_1>e1_2 && e2_1>e2_2 && swc<slc){
    escore += Punkte[15];
  }

  //TTR-Spezifisch
  if((TTR1-TTR2) < -Punkte[25]){
    //großer Underdog
    if(swc>slc){
      escore += Punkte[17];
    }
    else{
      escore += Punkte[19];
    }
  }
  else if((TTR1-TTR2) < -Punkte[24]){
    //kleiner Underdog
    if(swc>slc){
      escore += Punkte[16];
    }
    else{
      escore += Punkte[18];
    }
  }
  if((TTR1-TTR2) < Punkte[27]){
    //großer Favorit
    if(swc>slc){
      escore += Punkte[21];
    }
    else{
      escore += Punkte[23];
    }
  }
  else if((TTR1-TTR2) < Punkte[26]){
    //kleiner Favorit
    if(swc>slc){
      escore += Punkte[20];
    }
    else{
      escore += Punkte[22];
    }
  }
  
  global_swc+=swc
  global_slc+=slc
  if(swc>slc){
    global_gwc++;
  }

  return escore
}

function getScore(match, player, side) {
  //calculate scores for called player
  let score = 0
  let games = []
  global_swc = 0 //global set win counter
  global_slc = 0 //global set loss counter
  global_gwc = 0 //global game win counter

  for (var i = 0; i < match.length; i++) {
    if (side == "home") {
      if (match[i].mm_player11?.player_id == player?.player_id || match[i].mm_player12?.player_id == player?.player_id) {
        games.push(match[i])
      }
    }
    else if (side == "away") {
      if (match[i].mm_player21?.player_id == player?.player_id || match[i].mm_player22?.player_id == player?.player_id) {
        games.push(match[i])
      }
    }
  }
  
  for (var j = 0; j < games.length; j++) {
    if (games[j].game_type == "double") {
      score += getDScore(games[j], side)
    }
    else {
      score += getEScore(games[j], side)
    }
  }

  if(global_gwc == 3){
    score += Punkte[28]
  }
  if(global_swc == 9 && global_slc == 0){
    score += Punkte[29]
  }

  return Math.round(score)
}

module.exports = { Punkte, getDScore, getEScore, getScore };
