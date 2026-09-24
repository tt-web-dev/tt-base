function saveData(){

    localStorage.setItem('d1.1', document.getElementById('d1.1').value);
    localStorage.setItem('d1.2', document.getElementById('d1.2').value);
    localStorage.setItem('d2.1', document.getElementById('d2.1').value);
    localStorage.setItem('d2.2', document.getElementById('d2.2').value);
    localStorage.setItem('d3.1', document.getElementById('d3.1').value);
    localStorage.setItem('d3.2', document.getElementById('d3.2').value);
    localStorage.setItem('d4.1', document.getElementById('d4.1').value);
    localStorage.setItem('d4.2', document.getElementById('d4.2').value);
    localStorage.setItem('d5.1', document.getElementById('d5.1').value);
    localStorage.setItem('d5.2', document.getElementById('d5.2').value);

    localStorage.setItem('e1.1', document.getElementById('e1.1').value);
    localStorage.setItem('e1.2', document.getElementById('e1.2').value);
    localStorage.setItem('e2.1', document.getElementById('e2.1').value);
    localStorage.setItem('e2.2', document.getElementById('e2.2').value);
    localStorage.setItem('e3.1', document.getElementById('e3.1').value);
    localStorage.setItem('e3.2', document.getElementById('e3.2').value);
    localStorage.setItem('e4.1', document.getElementById('e4.1').value);
    localStorage.setItem('e4.2', document.getElementById('e4.2').value);
    localStorage.setItem('e5.1', document.getElementById('e5.1').value);
    localStorage.setItem('e5.2', document.getElementById('e5.2').value);

    localStorage.setItem('ee1.1', document.getElementById('ee1.1').value);
    localStorage.setItem('ee1.2', document.getElementById('ee1.2').value);
    localStorage.setItem('ee2.1', document.getElementById('ee2.1').value);
    localStorage.setItem('ee2.2', document.getElementById('ee2.2').value);
    localStorage.setItem('ee3.1', document.getElementById('ee3.1').value);
    localStorage.setItem('ee3.2', document.getElementById('ee3.2').value);
    localStorage.setItem('ee4.1', document.getElementById('ee4.1').value);
    localStorage.setItem('ee4.2', document.getElementById('ee4.2').value);
    localStorage.setItem('ee5.1', document.getElementById('ee5.1').value);
    localStorage.setItem('ee5.2', document.getElementById('ee5.2').value);

    localStorage.setItem('TTR1', document.getElementById('TTR1').value);
    localStorage.setItem('TTR3', document.getElementById('TTR3').value);
    localStorage.setItem('TTR4', document.getElementById('TTR4').value);

    localStorage.setItem('dbox0', document.getElementById('dbox0').checked);
    localStorage.setItem('ebox0', document.getElementById('ebox0').checked);
    localStorage.setItem('eebox0', document.getElementById('eebox0').checked);
    localStorage.setItem('dbox4', document.getElementById('dbox4').checked);
    localStorage.setItem('dbox5', document.getElementById('dbox5').checked);
    localStorage.setItem('ebox4', document.getElementById('ebox4').checked);
    localStorage.setItem('ebox5', document.getElementById('ebox5').checked);
    localStorage.setItem('eebox4', document.getElementById('eebox4').checked);
    localStorage.setItem('eebox5', document.getElementById('eebox5').checked);

    localStorage.setItem('uv.k', document.getElementById('uv.k').checked);
    localStorage.setItem('uv.g', document.getElementById('uv.g').checked);
}

function displaySavedData(){

    document.getElementById('d1.1').value = localStorage.getItem('d1.1');
    document.getElementById('d1.2').value = localStorage.getItem('d1.2');
    document.getElementById('d2.1').value = localStorage.getItem('d2.1');
    document.getElementById('d2.2').value = localStorage.getItem('d2.2');
    document.getElementById('d3.1').value = localStorage.getItem('d3.1');
    document.getElementById('d3.2').value = localStorage.getItem('d3.2');
    document.getElementById('d4.1').value = localStorage.getItem('d4.1');
    document.getElementById('d4.2').value = localStorage.getItem('d4.2');
    document.getElementById('d5.1').value = localStorage.getItem('d5.1');
    document.getElementById('d5.2').value = localStorage.getItem('d5.2');

    document.getElementById('e1.1').value = localStorage.getItem('e1.1');
    document.getElementById('e1.2').value = localStorage.getItem('e1.2');
    document.getElementById('e2.1').value = localStorage.getItem('e2.1');
    document.getElementById('e2.2').value = localStorage.getItem('e2.2');
    document.getElementById('e3.1').value = localStorage.getItem('e3.1');
    document.getElementById('e3.2').value = localStorage.getItem('e3.2');
    document.getElementById('e4.1').value = localStorage.getItem('e4.1');
    document.getElementById('e4.2').value = localStorage.getItem('e4.2');
    document.getElementById('e5.1').value = localStorage.getItem('e5.1');
    document.getElementById('e5.2').value = localStorage.getItem('e5.2');

    document.getElementById('ee1.1').value = localStorage.getItem('ee1.1');
    document.getElementById('ee1.2').value = localStorage.getItem('ee1.2');
    document.getElementById('ee2.1').value = localStorage.getItem('ee2.1');
    document.getElementById('ee2.2').value = localStorage.getItem('ee2.2');
    document.getElementById('ee3.1').value = localStorage.getItem('ee3.1');
    document.getElementById('ee3.2').value = localStorage.getItem('ee3.2');
    document.getElementById('ee4.1').value = localStorage.getItem('ee4.1');
    document.getElementById('ee4.2').value = localStorage.getItem('ee4.2');
    document.getElementById('ee5.1').value = localStorage.getItem('ee5.1');
    document.getElementById('ee5.2').value = localStorage.getItem('ee5.2');

    document.getElementById('TTR1').value = localStorage.getItem('TTR1');
    document.getElementById('TTR3').value = localStorage.getItem('TTR3');
    document.getElementById('TTR4').value = localStorage.getItem('TTR4');

    if(localStorage.getItem('dbox0') == "false"){
        document.getElementById('dbox0').checked = false;
    }
    else{
        document.getElementById('dbox0').checked = true;
    }
    if(localStorage.getItem('ebox0') == "false"){
        document.getElementById('ebox0').checked = false;
    }
    else{
        document.getElementById('ebox0').checked = true;
    }
    if(localStorage.getItem('eebox0') == "false"){
        document.getElementById('eebox0').checked = false;
    }
    else{
        document.getElementById('eebox0').checked = true;
    }
    if(localStorage.getItem('dbox4') == "false"){
        document.getElementById('dbox4').checked = false;
    }
    else{
        document.getElementById('dbox4').checked = true;
    }
    if(localStorage.getItem('dbox5') == "false"){
        document.getElementById('dbox5').checked = false;
    }
    else{
        document.getElementById('dbox5').checked = true;
    }
    if(localStorage.getItem('ebox4') == "false"){
        document.getElementById('ebox4').checked = false;
    }
    else{
        document.getElementById('ebox4').checked = true;
    }
    if(localStorage.getItem('ebox5') == "false"){
        document.getElementById('ebox5').checked = false;
    }
    else{
        document.getElementById('ebox5').checked = true;
    }
    if(localStorage.getItem('eebox4') == "false"){
        document.getElementById('eebox4').checked = false;
    }
    else{
        document.getElementById('eebox4').checked = true;
    }
    if(localStorage.getItem('eebox5') == "false"){
        document.getElementById('eebox5').checked = false;
    }
    else{
        document.getElementById('eebox5').checked = true;
    }

    if(localStorage.getItem('uv.k') == "true"){
        document.getElementById('uv.k').checked = true;
    }
    else{
        document.getElementById('uv.k').checked = false;
    }
    if(localStorage.getItem('uv.g') == "true"){
        document.getElementById('uv.g').checked = true;
    }
    else{
        document.getElementById('uv.g').checked = false;
    }


}
