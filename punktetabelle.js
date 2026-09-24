let Punkte = []

function showP() {
    //Grundsätze:
    document.getElementById('0').innerHTML = Punkte[0]; //Punkt gemacht
    document.getElementById('1').innerHTML = Punkte[1]; //Punkt verloren
    document.getElementById('2').innerHTML = Punkte[2]; //Satz gewonnen
    document.getElementById('3').innerHTML = Punkte[3]; //Satz verloren
    document.getElementById('4').innerHTML = Punkte[4]; //Spiel gewonnen
    document.getElementById('5').innerHTML = Punkte[5]; //Spiel verloren
    //Dominanz-Bonus:
    document.getElementById('6').innerHTML = Punkte[6]; //3-0 Sieg
    document.getElementById('7').innerHTML = Punkte[7]; //0-3 Niederlage
    document.getElementById('8').innerHTML = Punkte[8]; //3-1 Sieg
    document.getElementById('9').innerHTML = Punkte[9]; //1-3 Niederlage
    document.getElementById('10').innerHTML = Punkte[10]; //11-0; 11-1; 11-2 Sieg
    //Mental-Bonus:
    document.getElementById('11').innerHTML = Punkte[11]; //Verlängerungssatz gewonnen
    document.getElementById('12').innerHTML = Punkte[12]; //Fünfter Satz gewonnen
    document.getElementById('13').innerHTML = Punkte[13]; //Comeback (0-2 zu 2-2)
    document.getElementById('14').innerHTML = Punkte[14]; //Reverse Sweep (0-2 zu 3-2)
    document.getElementById('15').innerHTML = Punkte[15]; //Choke (2-0 zu 2-3) (nur für Favoriten)
    //TTR-Spezifisch:
    document.getElementById('16').innerHTML = Punkte[16]; //Sieg (kleiner Underdog)
    document.getElementById('17').innerHTML = Punkte[17]; //Sieg (großer Underdog)
    document.getElementById('18').innerHTML = Punkte[18]; //Niederlage (kleiner Underdog)
    document.getElementById('19').innerHTML = Punkte[19]; //Niederlage (großer Underdog)
    document.getElementById('20').innerHTML = Punkte[20]; //Sieg (kleiner Favorit)
    document.getElementById('21').innerHTML = Punkte[21]; //Sieg (großer Favorit)
    document.getElementById('22').innerHTML = Punkte[22]; //Niederlage (kleiner Favorit)
    document.getElementById('23').innerHTML = Punkte[23]; //Niederlage (großer Favorit)
    //TTR-Klassen:
    document.getElementById('24').innerHTML = `>${Punkte[24]} TTR weniger`; //kleiner Underdog
    document.getElementById('25').innerHTML = `>${Punkte[25]} TTR weniger`; //großer Underdog
    document.getElementById('26').innerHTML = `>${Punkte[26]} TTR mehr`; //kleiner Favorit
    document.getElementById('27').innerHTML = `>${Punkte[27]} TTR mehr`; //großer Favorit
    //Bilanz-Bonus:
    document.getElementById('28').innerHTML = Punkte[28]; //3:0 Games
    document.getElementById('29').innerHTML = Punkte[29]; //9:0 Sätze
}

document.addEventListener("DOMContentLoaded", function(event){
    const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
    fetch(`${API}/punkte`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server Error: ${response.status} ${response.statusText}`)
        }
        return response.json()
    })
    .then(data => {
        Punkte = data
        showP()
    })
    .catch(error => {
        console.log(error)
    })
})
