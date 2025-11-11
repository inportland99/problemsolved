const {html} = require('common-tags');

function Modal({id, title, body}) {
  return html`
    <div class="modal fade" id="${id}Modal" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="${id}Label">${title}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            ${body}
          </div>
        </div>
      </div>
    </div>
  `;
}

module.exports = Modal;

