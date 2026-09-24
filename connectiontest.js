document.addEventListener("DOMContentLoaded", function(event){

var div = document.createElement("div")
div.classList.add('flex-container')
div.innerHTML = "<p>NO CONNECTION TO SERVER</p><p>site might not work</p><p>try reloading or ask support for help</p>"
div.style.background = "red"

function connectiontest() {
    const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
    fetch(`${API}/connectiontest`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server Error: ${response.status} ${response.statusText}`)
        }
        return response.json()
    })
    .then(data => {
        console.log(data.msg)
    })
    .catch(error => {
        console.log(error)
        document.getElementById('header').prepend(div)
        window.scrollTo({ top: 0, behavior: 'smooth' });
    })
}

setTimeout(connectiontest, 3000)

})