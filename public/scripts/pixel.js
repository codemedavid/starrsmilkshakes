// Facebook Pixel base code
// Pixel ID is passed via data-pixel-id attribute on the script tag
(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
})(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

// Get pixel ID from the script tag's data attribute
(function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
        var script = scripts[i];
        if (script.id === 'fb-pixel' && script.dataset.pixelId) {
            fbq('init', script.dataset.pixelId);
            fbq('track', 'PageView');
            console.log('[FacebookPixel] Initialized with ID:', script.dataset.pixelId);
            break;
        }
    }
})();
