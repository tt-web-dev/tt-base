import { loadMatchdays } from './calendar.js';
import { teamselectSkeleton } from './loading.js';

const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';

let teams = []

document.addEventListener("DOMContentLoaded", function(event) {
  
  const openModalBtns = document.querySelectorAll('[data-modal-target]')
  const closeModalBtns = document.querySelectorAll('[data-modal-close-btn]')
  const overlay = document.getElementById('modal-overlay')

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-modal-target]')

    if (button) {
      const modal = document.querySelector(button.dataset.modalTarget)
      openModal(modal)
    }
  })
  
  overlay.addEventListener('click', () => {
    const modals = document.querySelectorAll('.modal.active')
    modals.forEach(modal => {
      closeModal(modal)
    })
  })
  
  closeModalBtns.forEach(button => {
    button.addEventListener('click', () => {
      const modal = button.closest('.modal')
      closeModal(modal)
    })
  })
  
  function openModal(modal) {
    if (modal == null) return
    modal.classList.add('active')
    overlay.classList.add('active')
    
    if (modal.id == 'teamselect-modal') {
      displayTeams()
    }

    if (modal.id == 'meeting-modal') {

    }
  }
  function closeModal(modal) {
    if (modal == null) return
    modal.classList.remove('active')
    overlay.classList.remove('active')
    
    if (modal.id == 'teamselect-modal') {
      sendTeams()
      document.getElementById('teamselect-flexbox').replaceChildren()
    }
    if (modal.id == 'meeting-modal') {
      document.getElementById('meeting-modal-body').replaceChildren()
    }
    if (modal.id == 'player-modal') {
      document.getElementById('player-modal-body').replaceChildren()
    }
  }
  
  function displayTeams() {
    const flexbox = document.getElementById('teamselect-flexbox')
    if (flexbox) flexbox.replaceChildren(teamselectSkeleton(4))
    fetch(`${API}/teams`)
        .then(response => {
            if(!response.ok){
                throw new Error(`Server Error: ${response.status} ${response.statusText}`)
            }
            return response.json()
        })
        .then(data => {
            teams = data
            console.log('teams ', teams)
            document.getElementById('teamselect-flexbox').replaceChildren()
            
            teams.forEach(team => {

              const box = document.createElement('input')
              const label = document.createElement('label')
              const img = document.createElement('img')
              const txt = document.createElement('p')

              label.classList.add('teamselect-box-label')

              box.type = 'checkbox'
              box.id = team.teamId
              if (team.active == true) {
                box.checked = true
              }

              txt.innerHTML = team.anzeigeName

              img.src = `./logos/${team.clubId}.png`

              label.appendChild(img)
              label.appendChild(txt)
              label.appendChild(box)
              document.getElementById('teamselect-flexbox').appendChild(label)
            })
        })
        .catch(error => {
            console.log(error)
            document.getElementById('teamselect-flexbox')?.replaceChildren('Teams konnten nicht geladen werden.')
        })
    
    
  }
  
  function sendTeams() {
    teams.forEach(team => {
      const box = document.getElementById(team.teamId)

        if(box && box.checked){
          team.active = true
        }
        else{
          team.active = false
        }
    })

    //put request
    fetch(`${API}/teams`, {
      method: "PUT",
      headers: {
        "Content-type": "application/json"

      },
      body: JSON.stringify(teams)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Netzwerkantwort war nicht ok');
      }
      loadMatchdays()
      return response.json();
    })
    .then(data => {

    })
    .catch(error => {
      console.error('Fehler beim Aktualisieren der Teams:', error);
    });

  }
  
})
