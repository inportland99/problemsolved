const {html} = require('common-tags');

function Modal({id, title, body}) {
  return html`
    <div id="${id}Modal" class="hidden fixed inset-0 z-50 items-center justify-center bg-black bg-opacity-50" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div class="flex items-center justify-between mb-4">
          <h5 class="text-2xl font-bold" id="${id}Label">${title}</h5>
          <button type="button" class="text-gray-500 hover:text-gray-700 text-2xl leading-none" data-dismiss="modal" aria-label="Close">
            &times;
          </button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
      </div>
    </div>
  `;
}

module.exports = Modal;

