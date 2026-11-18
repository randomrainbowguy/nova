// Private
function gmonetize_callback(event, args) {
    gmCallback.game_callback(event, args);  
}

function gmonetize_pause() {
	gmonetize_callback("gmonetize_pause");
}

function gmonetize_resume() {
	gmonetize_callback("gmonetize_resume");
}

function gmonetize_error() {
	gmonetize_callback("gmonetize_error");
}

function gmonetize_break() {
if (typeof sdk !== 'undefined' && sdk.showBanner !== 'undefined') {
sdk.showBanner();
}
}