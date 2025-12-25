'use client';

import { useEffect } from 'react';
import { useSiteSettings } from '../hooks/useSiteSettings';

/**
 * CustomHeaderScripts component
 * 
 * Injects custom scripts from the database into the document head.
 * This allows admins to add tracking codes like Meta Pixel, Google Analytics, etc.
 */
const CustomHeaderScripts = () => {
    const { siteSettings, loading } = useSiteSettings();

    useEffect(() => {
        if (loading || !siteSettings?.header_scripts) return;

        const scripts = siteSettings.header_scripts.trim();
        if (!scripts) return;

        // Create a container div to parse the HTML
        const container = document.createElement('div');
        container.innerHTML = scripts;

        // Process each child element
        const elementsToAdd: Node[] = [];

        Array.from(container.childNodes).forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;

                if (element.tagName === 'SCRIPT') {
                    // For script tags, we need to create a new script element
                    // because innerHTML doesn't execute scripts
                    const script = document.createElement('script');

                    // Copy attributes
                    Array.from(element.attributes).forEach(attr => {
                        script.setAttribute(attr.name, attr.value);
                    });

                    // Copy content
                    script.textContent = element.textContent;

                    elementsToAdd.push(script);
                } else if (element.tagName === 'NOSCRIPT') {
                    // Noscript elements can be added directly
                    const noscript = document.createElement('noscript');
                    noscript.innerHTML = element.innerHTML;
                    elementsToAdd.push(noscript);
                } else {
                    // Other elements (style, meta, etc.)
                    elementsToAdd.push(element.cloneNode(true));
                }
            } else if (node.nodeType === Node.COMMENT_NODE) {
                // Preserve comments
                elementsToAdd.push(node.cloneNode(true));
            }
        });

        // Add all elements to head
        elementsToAdd.forEach((el) => {
            document.head.appendChild(el);
        });

        console.log('[CustomHeaderScripts] Injected custom scripts into head');

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
