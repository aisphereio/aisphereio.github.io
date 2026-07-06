// Mermaid Interactive - adds zoom, pan, and fullscreen to Mermaid diagrams
(function() {
  'use strict';

  function enhanceMermaidDiagrams() {
    const containers = document.querySelectorAll('.mermaid');
    
    containers.forEach(function(container) {
      // Skip if already enhanced
      if (container.querySelector('.mermaid-zoom-controls')) return;
      
      container.style.position = 'relative';
      container.style.overflow = 'auto';
      container.style.cursor = 'grab';

      var svg = container.querySelector('svg');
      if (!svg) return;

      // Create zoom controls
      var controls = document.createElement('div');
      controls.className = 'mermaid-zoom-controls';
      controls.innerHTML = 
        '<button class="mermaid-zoom-btn" data-action="zoom-in" title="放大">+</button>' +
        '<button class="mermaid-zoom-btn" data-action="zoom-out" title="缩小">−</button>' +
        '<button class="mermaid-zoom-btn" data-action="reset" title="重置">⟲</button>' +
        '<button class="mermaid-zoom-btn" data-action="fullscreen" title="全屏">⛶</button>';
      container.appendChild(controls);

      var scale = 1;

      controls.addEventListener('click', function(e) {
        var btn = e.target.closest('.mermaid-zoom-btn');
        if (!btn) return;
        e.stopPropagation();

        var action = btn.getAttribute('data-action');

        switch (action) {
          case 'zoom-in':
            scale = Math.min(scale + 0.25, 3);
            break;
          case 'zoom-out':
            scale = Math.max(scale - 0.25, 0.5);
            break;
          case 'reset':
            scale = 1;
            break;
          case 'fullscreen':
            openFullscreen(svg.cloneNode(true));
            return;
        }

        svg.style.transform = 'scale(' + scale + ')';
        svg.style.transformOrigin = 'top left';
        svg.style.transition = 'transform 0.2s ease';
      });
    });
  }

  function openFullscreen(clonedSvg) {
    var overlay = document.createElement('div');
    overlay.className = 'mermaid-fullscreen';
    
    var closeBtn = document.createElement('div');
    closeBtn.className = 'mermaid-fullscreen-close';
    closeBtn.textContent = '✕';
    
    var wrapper = document.createElement('div');
    wrapper.style.transform = 'scale(1)';
    wrapper.style.transition = 'transform 0.2s ease';
    wrapper.appendChild(clonedSvg);

    overlay.appendChild(wrapper);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    var fsScale = 1;

    function close() {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      document.removeEventListener('keydown', onKeyDown);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);

    // Scroll to zoom
    overlay.addEventListener('wheel', function(e) {
      e.preventDefault();
      if (e.deltaY < 0) {
        fsScale = Math.min(fsScale + 0.1, 3);
      } else {
        fsScale = Math.max(fsScale - 0.1, 0.5);
      }
      wrapper.style.transform = 'scale(' + fsScale + ')';
    }, { passive: false });
  }

  // Run after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(enhanceMermaidDiagrams, 500);
    });
  } else {
    setTimeout(enhanceMermaidDiagrams, 500);
  }

  // Observe for dynamic content (page navigation)
  var observer = new MutationObserver(function() {
    enhanceMermaidDiagrams();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();