// ---IDs---
// TTR-input-felder: TTR1 TTR2
// Satz-input-felder: d1.1 d1.2 d2.1 ...| e1.1 ... | ee1.1 ...
// boxen: box1 box2 box3 | dbox4 dbox5 | ebox4 ebox5 | eebox4 eebox5
// expandables: expandable-head1 expandable-head2 ...
// buttos: rechner-btn
// select-checkbox: dbox0 ebox0 eebox0

let totalDuration;
let dscore;
let escore;
let eescore;
let zscore;
var finalscore = "?";
let Punkte = [];
const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
fetch(`${API}/punkte`)
        .then(response => {
            if(!response.ok){
                throw new Error(`Server Error: ${response.status} ${response.statusText}`)
            }
            return response.json()
        })
        .then(data => {
            Punkte = data
        })
        .catch(error => {
            console.log(error)
        })

function doppel() {
    dscore = 0;
    var swc = 0; //set win counter
    var slc = 0; //set loss counter
    var d1_1 = parseInt(document.getElementById('d1.1').value);
    var d1_2 = parseInt(document.getElementById('d1.2').value);
    var d2_1 = parseInt(document.getElementById('d2.1').value);
    var d2_2 = parseInt(document.getElementById('d2.2').value);
    var d3_1 = parseInt(document.getElementById('d3.1').value);
    var d3_2 = parseInt(document.getElementById('d3.2').value);
    var d4_1 = parseInt(document.getElementById('d4.1').value);
    var d4_2 = parseInt(document.getElementById('d4.2').value);
    var d5_1 = parseInt(document.getElementById('d5.1').value);
    var d5_2 = parseInt(document.getElementById('d5.2').value);
    const dbox4 = document.getElementById('dbox4');
    const dbox5 = document.getElementById('dbox5');

    if (dbox4.checked == false) {
        d4_1 = 0;
        d4_2 = 0;
    }
    if (dbox5.checked == false) {
        d5_1 = 0;
        d5_2 = 0;
    }
    //each single point
    dscore += Punkte[0]*(d1_1+d2_1+d3_1+d4_1+d5_1);
    dscore += Punkte[1]*(d1_2+d2_2+d3_2+d4_2+d5_2);
    //the sets
    if(d1_1>d1_2){
        dscore += Punkte[6];
        swc++;
    }
    else{
        dscore += Punkte[7];
        slc++;
    }
    if(d2_1>d2_2){
        dscore += Punkte[6];
        swc++;
    }
    else{
        dscore += Punkte[7];
        slc++;
    }
    if(d3_1>d3_2){
        dscore += Punkte[6];
        swc++;
    }
    else{
        dscore += Punkte[7];
        slc++;
    }
    if(d4_1>d4_2 && dbox4.checked){
        dscore += Punkte[6];
        swc++;
    }
    else if(d4_1<d4_2){
        dscore += Punkte[7];
        slc ++;
    }
    if(d5_1>d5_2 && dbox5.checked){
        dscore += Punkte[6];
        swc++;
    }
    else if(d5_1<d5_2){
        dscore += Punkte[7];
        slc++;
    }
    //the match
    if(swc>slc){
        dscore += Punkte[8];
    }
    else{
        dscore += Punkte[9];
    }
    //---ab hier "Mental"-----
    //Verlänergungssatz
    if(d1_1>d1_2 && d1_1>11){
        dscore += Punkte[10];
    }
    if(d2_1>d2_2 && d2_1>11){
        dscore += Punkte[10];
    }
    if(d3_1>d3_2 && d3_1>11){
        dscore += Punkte[10];
    }
    if(d4_1>d4_2 && d4_1>11 && dbox4.checked){
        dscore += Punkte[10];
    }
    if(d5_1>d5_2 && d5_1>11 && dbox5.checked){
        dscore += Punkte[10];
    }
    //Entscheidungssatz
    if(swc>slc && swc == 3 && slc == 2){
        dscore += Punkte[11];
    }
    //0:2 zu 2:2
    if(d1_1<d1_2 && d2_1<d2_2 && d3_1>d3_2 && d4_1>d4_2){
        dscore += Punkte[12];
    }
    //mit 0:2 gewonnen
    if(d1_1<d1_2 && d2_1<d2_2 && d3_1>d3_2 && d4_1>d4_2 && d5_1>d5_2){
        dscore += Punkte[13];
    }
    //mit 2:0 verloren
    if(d1_1>d1_2 && d2_1>d2_2 && swc<slc){
        dscore += Punkte[14];
    }
}

function einzel1() {
    escore = 0;
    var TTRscore = 1;
    var swc = 0; //set win counter
    var slc = 0; //set loss counter
    var e1_1 = parseInt(document.getElementById('e1.1').value);
    var e1_2 = parseInt(document.getElementById('e1.2').value);
    var e2_1 = parseInt(document.getElementById('e2.1').value);
    var e2_2 = parseInt(document.getElementById('e2.2').value);
    var e3_1 = parseInt(document.getElementById('e3.1').value);
    var e3_2 = parseInt(document.getElementById('e3.2').value);
    var e4_1 = parseInt(document.getElementById('e4.1').value);
    var e4_2 = parseInt(document.getElementById('e4.2').value);
    var e5_1 = parseInt(document.getElementById('e5.1').value);
    var e5_2 = parseInt(document.getElementById('e5.2').value);
    const ebox4 = document.getElementById('ebox4');
    const ebox5 = document.getElementById('ebox5');
    const TTR1 = parseInt(document.getElementById('TTR1').value);
    const TTR3 = parseInt(document.getElementById('TTR3').value);

    if (ebox4.checked == false) {
        e4_1 = 0;
        e4_2 = 0;
    }
    if (ebox5.checked == false) {
        e5_1 = 0;
        e5_2 = 0;
    }
    //each single point
    escore += Punkte[0]*(e1_1+e2_1+e3_1+e4_1+e5_1);
    escore += Punkte[1]*(e1_2+e2_2+e3_2+e4_2+e5_2);
    //the sets
    if(e1_1>e1_2){
        escore += Punkte[2];
        swc++;
    }
    else{
        escore += Punkte[3];
        slc++;
    }
    if(e2_1>e2_2){
        escore += Punkte[2];
        swc++;
    }
    else{
        escore += Punkte[3];
        slc++;
    }
    if(e3_1>e3_2){
        escore += Punkte[2];
        swc++;
    }
    else{
        escore += Punkte[3];
        slc++;
    }
    if(e4_1>e4_2 && ebox4.checked){
        escore += Punkte[2];
        swc++;
    }
    else if(e4_1<e4_2){
        escore += Punkte[3];
        slc ++;
    }
    if(e5_1>e5_2 && ebox5.checked){
        escore += Punkte[2];
        swc++;
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
    //---ab hier "Mental"-----
    //Verlängerungssatz
    if(e1_1>e1_2 && e1_1>11){
        escore += Punkte[10];
    }
    if(e2_1>e2_2 && e2_1>11){
        escore += Punkte[10];
    }
    if(e3_1>e3_2 && e3_1>11){
        escore += Punkte[10];
    }
    if(e4_1>e4_2 && e4_1>11 && ebox4.checked){
        escore += Punkte[10];
    }
    if(e5_1>e5_2 && e5_1>11 && ebox5.checked){
        escore += Punkte[10];
    }
    //Entscheieungssatz
    if(swc>slc && swc == 3 && slc == 2){
        escore += Punkte[11];
    }
    //0:2 zu 2:2
    if(e1_1<e1_2 && e2_1<e2_2 && e3_1>e3_2 && e4_1>e4_2){
        escore += Punkte[12];
    }
    //mit 0:2 gewonnen
    if(e1_1<e1_2 && e2_1<e2_2 && e3_1>e3_2 && e4_1>e4_2 && e5_1>e5_2){
        escore += Punkte[13];
    }
    //mit 2:0 verloren
    if(e1_1>e1_2 && e2_1>e2_2 && swc<slc){
        escore += Punkte[14];
    }

    //TTR-Differenz
    if((TTR1-TTR3)>Punkte[19]){
        if(escore>0){
            TTRscore = Punkte[17];
        }
        else if(escore<0){
            TTRscore = Punkte[18];
        }
    }
    if((TTR3-TTR1)>Punkte[20]){
        if(escore>0){
            TTRscore = Punkte[18];
        }
        else if(escore<0){
            TTRscore = Punkte[17];
        }
    }
    escore = escore * TTRscore;

}

function einzel2() {
    eescore = 0;
    var TTRscore = 1;
    var swc = 0; //set win counter
    var slc = 0; //set loss counter
    var ee1_1 = parseInt(document.getElementById('ee1.1').value);
    var ee1_2 = parseInt(document.getElementById('ee1.2').value);
    var ee2_1 = parseInt(document.getElementById('ee2.1').value);
    var ee2_2 = parseInt(document.getElementById('ee2.2').value);
    var ee3_1 = parseInt(document.getElementById('ee3.1').value);
    var ee3_2 = parseInt(document.getElementById('ee3.2').value);
    var ee4_1 = parseInt(document.getElementById('ee4.1').value);
    var ee4_2 = parseInt(document.getElementById('ee4.2').value);
    var ee5_1 = parseInt(document.getElementById('ee5.1').value);
    var ee5_2 = parseInt(document.getElementById('ee5.2').value);
    const eebox4 = document.getElementById('eebox4');
    const eebox5 = document.getElementById('eebox5');
    const TTR1 = parseInt(document.getElementById('TTR1').value);
    const TTR4 = parseInt(document.getElementById('TTR4').value);

    if (eebox4.checked == false) {
        ee4_1 = 0;
        ee4_2 = 0;
    }
    if (eebox5.checked == false) {
        ee5_1 = 0;
        ee5_2 = 0;
    }
    //each single point
    eescore += Punkte[0]*(ee1_1+ee2_1+ee3_1+ee4_1+ee5_1);
    eescore += Punkte[1]*(ee1_2+ee2_2+ee3_2+ee4_2+ee5_2);
    //the sets
    if(ee1_1>ee1_2){
        eescore += Punkte[2];
        swc++;
    }
    else{
        eescore += Punkte[3];
        slc++;
    }
    if(ee2_1>ee2_2){
        eescore += Punkte[2];
        swc++;
    }
    else{
        eescore += Punkte[3];
        slc++;
    }
    if(ee3_1>ee3_2){
        eescore += Punkte[2];
        swc++;
    }
    else{
        eescore += Punkte[3];
        slc++;
    }
    if(ee4_1>ee4_2 && eebox4.checked){
        eescore += Punkte[2];
        swc++;
    }
    else if(ee4_1<ee4_2){
        eescore += Punkte[3];
        slc ++;
    }
    if(ee5_1>ee5_2 && eebox5.checked){
        eescore += Punkte[2];
        swc++;
    }
    else if(ee5_1<ee5_2){
        eescore += Punkte[3];
        slc++;
    }
    //the match
    if(swc>slc){
        eescore += Punkte[4];
    }
    else{
        eescore += Punkte[5];
    }
    //---ab hier "Mental"-----
    //Verlängerungssatz
    if(ee1_1>ee1_2 && ee1_1>11){
        eescore += Punkte[10];
    }
    if(ee2_1>ee2_2 && ee2_1>11){
        eescore += Punkte[10];
    }
    if(ee3_1>ee3_2 && ee3_1>11){
        eescore += Punkte[10];
    }
    if(ee4_1>ee4_2 && ee4_1>11 && eebox4.checked){
        eescore += Punkte[10];
    }
    if(ee5_1>ee5_2 && ee5_1>11 && eebox5.checked){
        eescore += Punkte[10];
    }
    //Entscheieungssatz
    if(swc>slc && swc == 3 && slc == 2){
        eescore += Punkte[11];
    }
    //0:2 zu 2:2
    if(ee1_1<ee1_2 && ee2_1<ee2_2 && ee3_1>ee3_2 && ee4_1>ee4_2){
        eescore += Punkte[12];
    }
    //mit 0:2 gewonnen
    if(ee1_1<ee1_2 && ee2_1<ee2_2 && ee3_1>ee3_2 && ee4_1>ee4_2 && ee5_1>ee5_2){
        eescore += Punkte[13];
    }
    //mit 2:0 verloren
    if(ee1_1>ee1_2 && ee2_1>ee2_2 && swc<slc){
        eescore += Punkte[14];
    }

    //TTR-Differenz
    if((TTR1-TTR4)>Punkte[19]){
        if(eescore>0){
            TTRscore = Punkte[17];
        }
        else if(eescore<0){
            TTRscore = Punkte[18];
        }
    }
    if((TTR4-TTR1)>Punkte[20]){
        if(eescore>0){
            TTRscore = Punkte[18];
        }
        else if(eescore<0){
            TTRscore = Punkte[17];
        }
    }
    eescore = eescore * TTRscore;


}

function zusätze() {
    zscore = 0;
    const zbox1 = document.getElementById('uv.k');
    const zbox2 = document.getElementById('uv.g');

    if(zbox1.value == true) {
        zscore += Punkte[15]
    }
    if(zbox2.value == true) {
        zscore += Punkte[16]
    }
}

function showBarPos() {
    var endpercentage = (finalscore/3)*0.01
    const score_bar = document.getElementById('score-bar');

    score_bar.animate([
    {
        offset: 0,
        height: "0%",
        backgroundColor: "#E82017",
    },
    {
        offset: 0.01,
        height: "1%",
        backgroundColor: "#B36010",
    },
    {
        offset: 0.3332,
        height: "49%",
        backgroundColor: "#B36010",
    },
    {
        offset: 0.3333,
        height: "50%",
        backgroundColor: "#93D145",
    },
    {
        offset: 0.6665,
        height: "74%",
        backgroundColor: "#93D145",
    },
    {
        offset: 0.6666,
        height: "75%",
        backgroundColor: "#1DAD68",
    },
    {
        offset: 0.9999,
        height: "99%",
        backgroundColor: "#1DAD68",
    },
    {
        offset: 1,
        height: "100%",
        backgroundColor: "#DCB941",
    },
    ], {
        duration: totalDuration,
        fill: "forwards",
        easing: "linear",
        iterations: endpercentage,
    });

}

function showBarNeg(){
    const score_bar = document.getElementById('score-bar');
    document.getElementById('score').innerHTML = finalscore;

    score_bar.animate([
        {
            offset: 0,
            height: "0%",
            backgroundColor: "#E82017",
        },
        {
            offset: 1,
            height: "5%",
            backgroundColor: "#E82017",
        },
    ], {
        duration: totalDuration,
        fill: "forwards",
        easing: "linear",
    } );
}

function showScore(){
    const animationDuration = totalDuration;
    const frameDuration = 1000 / 60;
    const totalFrames = Math.round(animationDuration / frameDuration);
    const easeOutFunc = t => 1 - Math.pow(1 - t, 7);

    const animateCountUp = el => {
        let frame = 0;
        const countTo = finalscore;
        const counter = setInterval( () => {
            frame++;
            const progress = easeOutFunc(frame / totalFrames);
            const currentCount = Math.round(countTo * progress);
            if(parseInt(el.innerHTML, 10) !== currentCount){
                el.innerHTML = currentCount;
            }
            if(frame === totalFrames){
                clearInterval(counter);
            }
        }, frameDuration);
    };

    const runAnimations = () => {
        const countupEls = document.querySelectorAll('.score');
        countupEls.forEach(animateCountUp);
    };
    runAnimations();
}


document.addEventListener("DOMContentLoaded", function(event){
// on button click:
document.getElementById('rechnen-btn').addEventListener("click", function() {
    dscore = 0;
    escore = 0;
    eescore = 0;
    zscore = 0;
    const dbox0 = document.getElementById('dbox0');
    const ebox0 = document.getElementById('ebox0');
    const eebox0 = document.getElementById('eebox0');

    if(dbox0.checked == true){
        doppel();
    }
    if(ebox0.checked == true){
        einzel1();
    }
    if(eebox0.checked == true){
        einzel2();
    }
    zusätze();

    finalscore = Math.round(dscore + escore + eescore + zscore);
    if(finalscore>=0){
        totalDuration = 5000;
        showBarPos();
        showScore();
    }
    else if(finalscore<0){
        totalDuration = 3000;
        showBarNeg();
        showScore();
    }
})


})




