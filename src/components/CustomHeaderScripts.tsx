'use client';

import { useEffect } from 'react';
import { useSiteSettings } from '../hooks/useSiteSettings';

// Allowed tag names for script injection (whitelist)
const ALLOWED_TAGS = new Set(['SCRIPT', 'NOSCRIPT', 'META', 'LINK']);

// Allowed attributes for script tags (no inline event handlers)
const ALLOWED_SCRIPT_ATTRS = new Set(['src', 'async', 'defer', 'type', 'id', 'crossorigin', 'integrity', 'nomodule']);

// Allowed attributes for link tags
const ALLOWED_LINK_ATTRS = new Set(['rel', 'href', 'type', 'media', 'as', 'crossorigin', 'integrity']);

// Allowed attributes for meta tags
const ALLOWED_META_ATTRS = new Set(['name', 'content', 'charset', 'http-equiv', 'property']);

/**
 * Check if an attribute is a dangerous inline event handler
 */
const isDangerousAttr = (attrName: string): boolean => {
    return attrName.toLowerCase().startsWith('on') || attrName.toLowerCase() === 'formaction';
};

/**
 * Validate and sanitize a single element
 * Returns null if the element is not allowed
 */
const sanitizeElement = (element: Element): Node | null => {
    const tagName = element.tagName.toUpperCase();

    if (!ALLOWED_TAGS.has(tagName)) {
        console.warn(`[CustomHeaderScripts] Blocked disallowed tag: ${tagName}`);
        return null;
    }

    if (tagName === 'SCRIPT') {
        const script = document.createElement('script');

        // Only allow external scripts with src attribute, no inline scripts
        const srcAttr = element.getAttribute('src');
        if (!srcAttr || srcAttr.trim() === '') {
            console.warn('[CustomHeaderScripts] Blocked inline script - only external scripts with src are allowed');
            return null;
        }

        // Validate src URL (must be http/https)
        try {
            const url = new URL(srcAttr);
            if (!['http:', 'https:'].includes(url.protocol)) {
                console.warn(`[CustomHeaderScripts] Blocked script with invalid protocol: ${url.protocol}`);
                return null;
            }
        } catch {
            console.warn(`[CustomHeaderScripts] Blocked script with invalid URL: ${srcAttr}`);
            return null;
        }

        // Copy only allowed attributes
        Array.from(element.attributes).forEach(attr => {
            const attrName = attr.name.toLowerCase();
            if (ALLOWED_SCRIPT_ATTRS.has(attrName) && !isDangerousAttr(attrName)) {
                script.setAttribute(attr.name, attr.value);
            }
        });

        return script;
    }

    if (tagName === 'NOSCRIPT') {
        const noscript = document.createElement('noscript');
        // For noscript, we only allow text content or img tags
        const imgs = element.querySelectorAll('img');
        imgs.forEach(img => {
            const newImg = document.createElement('img');
            // Only copy safe attributes
            ['src', 'width', 'height', 'alt', 'style'].forEach(attrName => {
                const val = img.getAttribute(attrName);
                if (val) {
                    // Validate src URL
                    if (attrName === 'src') {
                        try {
                            const url = new URL(val);
                            if (['http:', 'https:'].includes(url.protocol)) {
                                newImg.setAttribute(attrName, val);
                            }
                        } catch {
                            // Skip invalid URLs
                        }
                    } else if (attrName === 'style') {
                        // Only allow display:none for tracking pixels
                        if (val === 'display:none' || val === 'display: none') {
                            newImg.setAttribute(attrName, val);
                        }
                    } else {
                        newImg.setAttribute(attrName, val);
                    }
                }
            });
            if (newImg.getAttribute('src')) {
                noscript.appendChild(newImg);
            }
        });
        return noscript;
    }

    if (tagName === 'META') {
        const meta = document.createElement('meta');
        Array.from(element.attributes).forEach(attr => {
            const attrName = attr.name.toLowerCase();
            if (ALLOWED_META_ATTRS.has(attrName) && !isDangerousAttr(attrName)) {
                meta.setAttribute(attr.name, attr.value);
            }
        });
        // Only add if it has valid meta attributes
        if (meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('charset')) {
            return meta;
        }
        return null;
    }

    if (tagName === 'LINK') {
        const link = document.createElement('link');
        Array.from(element.attributes).forEach(attr => {
            const attrName = attr.name.toLowerCase();
            if (ALLOWED_LINK_ATTRS.has(attrName) && !isDangerousAttr(attrName)) {
                // Validate URLs
                if (attrName === 'href') {
                    try {
                        const url = new URL(attr.value);
                        if (['http:', 'https:'].includes(url.protocol)) {
                            link.setAttribute(attr.name, attr.value);
                        }
                    } catch {
                        // Skip invalid URLs
                    }
                } else {
                    link.setAttribute(attr.name, attr.value);
                }
            }
        });
        // Only add if it has href
        if (link.getAttribute('href')) {
            return link;
        }
        return null;
    }

    return null;
};

/**
 * CustomHeaderScripts component
 * 
 * Injects sanitized custom scripts from the database into the document head.
 * Only allows whitelisted elements (script with external src, noscript, meta, link).
 * Blocks inline scripts and event handlers for security.
 */
const CustomHeaderScripts = () => {
    const { siteSettings, loading } = useSiteSettings();

    useEffect(() => {
        if (loading || !siteSettings?.header_scripts) return;

        const scripts = siteSettings.header_scripts.trim();
        if (!scripts) return;

        // Create a container div to parse the HTML
        // Using DOMParser is safer than innerHTML as it doesn't execute scripts during parsing
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<body>${scripts}</body>`, 'text/html');
        const container = doc.body;

        // Process each child element with sanitization
        const elementsToAdd: Node[] = [];

        Array.from(container.childNodes).forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const sanitized = sanitizeElement(node as Element);
                if (sanitized) {
                    elementsToAdd.push(sanitized);
                }
            }
            // Ignore comments and text nodes for security
        });

        // Add all sanitized elements to head
        elementsToAdd.forEach((el) => {
            document.head.appendChild(el);
        });

        if (elementsToAdd.length > 0) {
            console.log(`[CustomHeaderScripts] Injected ${elementsToAdd.length} sanitized element(s) into head`);
        }

        // Cleanup on unmount
        return () => {
            elementsToAdd.forEach((el) => {
                if (el.parentNode === document.head) {
                    document.head.removeChild(el);
                }
            });
        };
    }, [siteSettings?.header_scripts, loading]);

    return null;
};

export default CustomHeaderScripts;
