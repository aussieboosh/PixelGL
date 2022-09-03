class DOM
{
	static get(id) { return ((id instanceof HTMLElement) || (id === document)) ? id : document.getElementById(id); }
	static set(id, html) { this.get(id).innerHTML = html; }
	static show(id) { this.get(ele).style.display = "block"; }
	static hide(id) { this.get(ele).style.display = "none"; }
	static on(id, type, fn, capture = false) { DOM.get(id).addEventListener(type, fn, capture); }
	static un(id, type, fn, capture = false) { DOM.get(id).removeEventListener(type, fn, capture); };
}