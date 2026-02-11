'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TopicPagesPage() {
  const params = useParams();
  const router = useRouter();
  const topicId = params.topicId;

  const [pages, setPages] = useState([]);
  const [topicTitle, setTopicTitle] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [bookId, setBookId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [quillLoaded, setQuillLoaded] = useState(false);
  
  const [livePages, setLivePages] = useState([
    { id: 'page-1', content: '', existingPageId: null }
  ]);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [editingPageId, setEditingPageId] = useState(null);
  const quillRefs = useRef({});
  const initializedEditors = useRef(new Set());
  const reflowTimeout = useRef(null);
  const topRef = useRef(null);

  // A4 EXACT DIMENSIONS (96 DPI standard)
  const PAGE_WIDTH = 794;
  const PAGE_HEIGHT = 1123;
  const HEADER_HEIGHT = 60;
  const FOOTER_HEIGHT = 50;
  const CONTENT_PADDING = 40;
  const CONTENT_HEIGHT = PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT;
  const CONTENT_WIDTH = PAGE_WIDTH - (CONTENT_PADDING * 2);

 useEffect(() => {
  const loadQuill = async () => {
    // Load Quill CSS
    const link = document.createElement('link');
    link.href = 'https://cdn.quilljs.com/1.3.6/quill.snow.css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // Load Quill JS
    const script = document.createElement('script');
    script.src = 'https://cdn.quilljs.com/1.3.6/quill.js';
    
    script.onload = () => {
      // Load Image Resize Module
      const resizeScript = document.createElement('script');
      resizeScript.src = 'https://unpkg.com/quill-image-resize-module@3.0.0/image-resize.min.js';
      
      resizeScript.onload = () => {
        // Register module
        try {
          window.Quill.register('modules/imageResize', window.ImageResize.default || window.ImageResize);
          console.log('✅ Image Resize module registered');
        } catch (e) {
          console.error('❌ Failed to register Image Resize:', e);
        }
        
        setTimeout(() => setQuillLoaded(true), 200);
      };
      
      resizeScript.onerror = () => {
        console.error('❌ Failed to load Image Resize module');
        setTimeout(() => setQuillLoaded(true), 200);
      };
      
      document.body.appendChild(resizeScript);
    };
    
    document.body.appendChild(script);
  };

  loadQuill();
  fetchPages();
  fetchTopicDetails();

  return () => {
    Object.values(quillRefs.current).forEach(quill => {
      if (quill) {
        const container = quill.container;
        if (container && container.parentNode) {
          container.parentNode.innerHTML = '';
        }
      }
    });
  };
}, [topicId]);


  const fetchTopicDetails = async () => {
    try {
      const res = await fetch(`/api/author/topics/details?topic_id=${topicId}`);
      const data = await res.json();
      

      
      if (data.success) {
        setTopicTitle(data.topic?.name || '');
        setBookTitle(data.book?.title || '');
        setBookId(data.topic?.book_id);
      }
    } catch (error) {
      console.error('Error fetching topic details:', error);
    }
  };

  const fetchPages = async () => {
    const res = await fetch(`/api/author/pages?topic_id=${topicId}`);
    const data = await res.json();
    if (data.success) {
      setPages(data.data);
    }
  };

  const splitContentIntoPages = (htmlContent) => {
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${CONTENT_WIDTH}px;
      padding: 0;
      font-size: 16px;
      line-height: 1.6;
      font-family: 'Georgia', 'Times New Roman', serif;
      word-wrap: break-word;
      overflow-wrap: break-word;
    `;
    document.body.appendChild(tempDiv);

    const pages = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
    const blocks = Array.from(doc.body.querySelector('div').children);

    let currentPageHTML = '';
    let currentHeight = 0;

    for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
      const block = blocks[blockIdx];
      const tagName = block.tagName.toLowerCase();
      let blockAttrs = '';
      
      for (let attr of block.attributes) {
        blockAttrs += ` ${attr.name}="${attr.value}"`;
      }

      const blockHTML = `<${tagName}${blockAttrs}>${block.innerHTML}</${tagName}>`;
      const testHTML = currentPageHTML + blockHTML;
      tempDiv.innerHTML = testHTML;
      const testHeight = tempDiv.scrollHeight;

      if (testHeight > CONTENT_HEIGHT) {
        if (currentPageHTML.trim()) {
          pages.push(currentPageHTML.trim());
          currentPageHTML = '';
        }

        const sentences = block.innerHTML.split(/(?<=[.!?])\s+/);
        let sentenceBuffer = '';

        for (let sentence of sentences) {
          if (!sentence.trim()) continue;

          const testSentence = sentenceBuffer 
            ? `${sentenceBuffer} ${sentence}` 
            : sentence;
          
          const testHTML = `<${tagName}${blockAttrs}>${testSentence}</${tagName}>`;
          tempDiv.innerHTML = currentPageHTML + testHTML;

          if (tempDiv.scrollHeight > CONTENT_HEIGHT) {
            if (sentenceBuffer) {
              const sentenceHTML = `<${tagName}${blockAttrs}>${sentenceBuffer}</${tagName}>`;
              const pageToSave = (currentPageHTML + sentenceHTML).trim();
              
              if (pageToSave) {
                pages.push(pageToSave);
              }
              currentPageHTML = '';
              sentenceBuffer = sentence;
            } else {
              const words = sentence.split(/\s+/);
              let wordBuffer = '';

              for (let word of words) {
                const testWord = wordBuffer ? `${wordBuffer} ${word}` : word;
                const testHTML = `<${tagName}${blockAttrs}>${testWord}</${tagName}>`;
                tempDiv.innerHTML = currentPageHTML + testHTML;

                if (tempDiv.scrollHeight > CONTENT_HEIGHT && wordBuffer) {
                  const wordHTML = `<${tagName}${blockAttrs}>${wordBuffer}</${tagName}>`;
                  pages.push((currentPageHTML + wordHTML).trim());
                  currentPageHTML = '';
                  wordBuffer = word;
                } else {
                  wordBuffer = testWord;
                }
              }

              if (wordBuffer) {
                sentenceBuffer = wordBuffer;
              }
            }
          } else {
            sentenceBuffer = testSentence;
          }
        }

        if (sentenceBuffer) {
          const finalHTML = `<${tagName}${blockAttrs}>${sentenceBuffer}</${tagName}>`;
          currentPageHTML += finalHTML;
        }
      } else {
        currentPageHTML = testHTML;
      }
    }

    if (currentPageHTML.trim() && currentPageHTML !== '<p><br></p>') {
      pages.push(currentPageHTML.trim());
    }

    document.body.removeChild(tempDiv);
    return pages.length > 0 ? pages : [htmlContent];
  };

  const initQuill = (index) => {
    if (!window.Quill) return;

    const editorId = `editor-${index}`;
    
    if (initializedEditors.current.has(editorId)) {
      return;
    }

    const container = document.getElementById(editorId);
    
    if (!container) return;

    if (quillRefs.current[index]) {
      const parentDiv = container.parentNode;
      if (parentDiv) {
        const existingToolbar = parentDiv.querySelector('.ql-toolbar');
        if (existingToolbar) {
          existingToolbar.remove();
        }
      }
      container.innerHTML = '';
      delete quillRefs.current[index];
    } else {
      const parentDiv = container.parentNode;
      if (parentDiv) {
        const orphanedToolbars = parentDiv.querySelectorAll('.ql-toolbar');
        orphanedToolbars.forEach(toolbar => toolbar.remove());
      }
    }

     const quill = new window.Quill(`#${editorId}`, {
      theme: 'snow',
      modules: {
        toolbar: [
  [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
  [{ 'font': [] }],  // Font family selector
  [{ 'size': ['small', false, 'large', 'huge'] }],  // Font size
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'color': [] }, { 'background': [] }],
  [{ 'script': 'sub'}, { 'script': 'super' }],  // Subscript/Superscript
  [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],  // Checklist
  [{ 'indent': '-1'}, { 'indent': '+1' }],  // Indent/outdent
  [{ 'direction': 'rtl' }],  // Text direction
  [{ 'align': [] }],
  ['blockquote', 'code-block'],  // Blockquote and code block
  ['link', 'image'],  // Video embedding
  ['clean']  // Remove formatting
],
 imageResize: {
    modules: ['Resize', 'DisplaySize', 'Toolbar']
  },

        clipboard: {
          matchVisual: false
        }
      },
      placeholder: 'Start typing or paste content...'
    });

    if (livePages[index]?.content) {
      quill.root.innerHTML = livePages[index].content;
    }

    // Prevent further insertion when page is full, but allow deletions/navigation
    const enforceLimit = () => {
      const onKeyDown = (e) => {
        try {
          const h = measureRenderedHeight(quill.root.innerHTML);
          if (h >= CONTENT_HEIGHT) {
            const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Tab'];
            if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            const pageHeader = container.closest('.page-editor-container')?.querySelector('.page-header');
            if (pageHeader) {
              const old = pageHeader.style.background;
              pageHeader.style.background = '#fee2e2';
              setTimeout(() => pageHeader.style.background = old, 450);
            }
          }
        } catch (err) {}
      };

      const onPaste = (e) => {
        try {
          const h = measureRenderedHeight(quill.root.innerHTML);
          if (h >= CONTENT_HEIGHT) {
            e.preventDefault();
            alert('Page is full. Remove some content before pasting.');
          }
        } catch (err) {}
      };

      quill.root.addEventListener('keydown', onKeyDown);
      quill.root.addEventListener('paste', onPaste);
      quill.__enforceHandlers = { onKeyDown, onPaste };
    };

    enforceLimit();

    quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
      setTimeout(() => {
        const currentContent = quill.root.innerHTML;
        const splitPages = splitContentIntoPages(currentContent);

        if (splitPages.length > 1) {
          setSplitting(true);
          
          quill.root.innerHTML = splitPages[0];
          updatePageContent(index, splitPages[0]);

          if (livePages.length === 1 && (!livePages[0].content || livePages[0].content.trim() === '' || livePages[0].content === '<p><br></p>')) {
            const newPages = splitPages.map((pageContent, i) => ({
              id: `page-${Date.now()}-${i}`,
              content: pageContent,
              existingPageId: null
            }));
            
            initializedEditors.current.clear();
            setLivePages(newPages);
          } else {
            const newPages = [...livePages];
            for (let i = 1; i < splitPages.length; i++) {
              newPages.splice(index + i, 0, {
                id: `page-${Date.now()}-${i}`,
                content: splitPages[i],
                existingPageId: null
              });
            }

            initializedEditors.current.clear();
            setLivePages(newPages);
          }

          setTimeout(() => {
            setSplitting(false);
            setTimeout(() => {
              alert(`✅ Content split into ${splitPages.length} A4 pages!`);
            }, 100);
          }, 500);
        }
      }, 100);

      return delta;
    });

    quill.on('text-change', () => {
      const content = quill.root.innerHTML;
      const editorHeight = quill.root.scrollHeight;

      // Measure the actual rendered height of the content (not the container)
      // using a hidden temp div so we compute a real fill percentage.
      let contentHeight = 0;
      try {
        if (content && content.trim() && content !== '<p><br></p>') {
          const temp = document.createElement('div');
          temp.style.cssText = `position:absolute;visibility:hidden;width:${CONTENT_WIDTH}px;padding:0;font-size:16px;line-height:1.6;font-family:'Georgia', 'Times New Roman', serif;word-wrap:break-word;overflow-wrap:break-word;`;
          temp.innerHTML = content;
          document.body.appendChild(temp);
          contentHeight = temp.scrollHeight;
          document.body.removeChild(temp);
        } else {
          contentHeight = 0;
        }
      } catch (err) {
        contentHeight = quill.root.scrollHeight || 0;
      }

      let fillPercentage = Math.min(100, Math.max(0, Math.round((contentHeight / CONTENT_HEIGHT) * 100)));

      // Fallback: if measurement failed (contentHeight === 0) but there is textual content,
      // estimate fill based on word count so percentage increases as user types.
      if ((contentHeight === 0 || isNaN(fillPercentage)) && content && content.trim() && content !== '<p><br></p>') {
        const tempText = (content && typeof document !== 'undefined') ? (new DOMParser().parseFromString(content, 'text/html').body.textContent || '') : '';
        const words = tempText.trim().split(/\s+/).filter(w => w.length > 0).length;
        const WORDS_PER_PAGE = 450; // approximate words that fit an A4 page
        fillPercentage = Math.min(99, Math.round((words / WORDS_PER_PAGE) * 100));
      }
      
      if (reflowTimeout.current) {
        clearTimeout(reflowTimeout.current);
      }
      
      if (editorHeight > CONTENT_HEIGHT) {
        reflowTimeout.current = setTimeout(() => {
          setLivePages(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], content };
            
            let allContent = '';
            for (let i = 0; i < updated.length; i++) {
              const pageContent = updated[i].content || '';
              if (pageContent.trim() && pageContent !== '<p><br></p>') {
                allContent += pageContent;
              }
            }
            
            const reflowedPages = splitContentIntoPages(allContent);
            
            const newPages = [];
            reflowedPages.forEach((pageContent, i) => {
              newPages.push({
                id: updated[i]?.id || `page-${Date.now()}-${i}`,
                content: pageContent,
                existingPageId: updated[i]?.existingPageId || null
              });
            });
            
            // Don't add extra blank page - splitContentIntoPages already handles pagination
            
            return newPages;
          });
          
          setTimeout(() => {
            initializedEditors.current.clear();
            Object.keys(quillRefs.current).forEach(key => {
              const container = document.getElementById(`editor-${key}`);
              if (container?.parentNode) {
                const toolbar = container.parentNode.querySelector('.ql-toolbar');
                if (toolbar) toolbar.remove();
              }
              delete quillRefs.current[key];
            });
          }, 50);
        }, 300);
        
        return;
      }
      
      updatePageContent(index, content);
      
      const pageHeader = document.querySelector(`#editor-${index}`)?.closest('.page-editor-container')?.querySelector('.page-header');
      const pageStatus = pageHeader?.querySelector('.page-status');
      
      if (pageHeader && pageStatus) {
        if (fillPercentage >= 95) {
          pageHeader.style.background = '#fef3c7';
          pageStatus.textContent = `${fillPercentage}% filled`;
          pageStatus.className = 'page-status ml-3 text-xs font-semibold text-yellow-700';
        } else {
          pageHeader.style.background = '#f9fafb';
          pageStatus.textContent = `${fillPercentage}% filled`;
          pageStatus.className = 'page-status ml-3 text-xs font-semibold text-gray-600';
        }
      }
    });

    quillRefs.current[index] = quill;
    initializedEditors.current.add(editorId);
  };

  useEffect(() => {
    if (quillLoaded) {
      livePages.forEach((_, index) => {
        const editorId = `editor-${index}`;
        if (!initializedEditors.current.has(editorId)) {
          setTimeout(() => initQuill(index), 100 * index);
        }
      });
    }
  }, [quillLoaded, livePages.length]);

  const updatePageContent = (index, content) => {
    setLivePages(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], content };
      return updated;
    });
  };

  const countWords = (html) => {
    if (typeof window === 'undefined') return 0;
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || temp.innerText || '';
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  };

  const updatePageStatus = (quill, container) => {
    if (!quill || !container) return;

    // Try to measure rendered content height first
    let contentHeight = 0;
    try {
      const html = quill.root.innerHTML || '';
      if (html && html.trim() && html !== '<p><br></p>') {
        const temp = document.createElement('div');
        temp.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;width:${CONTENT_WIDTH}px;padding:0;font-size:16px;line-height:1.6;font-family:'Georgia', 'Times New Roman', serif;word-wrap:break-word;overflow-wrap:break-word;`;
        temp.innerHTML = html;
        document.body.appendChild(temp);
        contentHeight = temp.scrollHeight || 0;
        document.body.removeChild(temp);
      } else {
        contentHeight = 0;
      }
    } catch (e) {
      contentHeight = quill.root.scrollHeight || 0;
    }

    let fillPercentage = Math.min(100, Math.max(0, Math.round((contentHeight / CONTENT_HEIGHT) * 100)));

    // Fallback to word-count estimate when measurement fails
    if ((contentHeight === 0 || isNaN(fillPercentage)) && quill && quill.root) {
      const text = (new DOMParser().parseFromString(quill.root.innerHTML || '', 'text/html').body.textContent || '').trim();
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      const WORDS_PER_PAGE = 450;
      fillPercentage = Math.min(99, Math.round((words / WORDS_PER_PAGE) * 100));
    }

    const pageHeader = container.closest('.page-editor-container')?.querySelector('.page-header');
    const pageStatus = pageHeader?.querySelector('.page-status');

    if (pageHeader && pageStatus) {
      if (contentHeight > CONTENT_HEIGHT) {
        pageHeader.style.background = '#fee2e2';
        pageStatus.textContent = '⚠️ Exceeds A4 page!';
        pageStatus.className = 'page-status ml-3 text-xs font-semibold text-red-600';
      } else if (fillPercentage >= 95) {
        pageHeader.style.background = '#fef3c7';
        pageStatus.textContent = `${fillPercentage}% filled`;
        pageStatus.className = 'page-status ml-3 text-xs font-semibold text-yellow-700';
      } else {
        pageHeader.style.background = '#f9fafb';
        pageStatus.textContent = `${fillPercentage}% filled`;
        pageStatus.className = 'page-status ml-3 text-xs font-semibold text-gray-600';
      }
    }
  };

  const measureRenderedHeight = (html) => {
    try {
      const temp = document.createElement('div');
      temp.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;width:${CONTENT_WIDTH}px;padding:0;font-size:16px;line-height:1.6;font-family:'Georgia', 'Times New Roman', serif;word-wrap:break-word;overflow-wrap:break-word;`;
      temp.innerHTML = html || '';
      document.body.appendChild(temp);
      const h = temp.scrollHeight || 0;
      document.body.removeChild(temp);
      return h;
    } catch (e) {
      return 0;
    }
  };

  const addNewPage = () => {
    const newPage = { id: `page-${Date.now()}`, content: '', existingPageId: null };
    setLivePages(prev => [...prev, newPage]);
    setEditingPageId(null);
    setTimeout(() => {
      initQuill(livePages.length);
      setSelectedPageIndex(livePages.length);
    }, 200);
  };

  const deletePage = (index) => {
    if (livePages.length === 1) {
      alert('Cannot delete the last page!');
      return;
    }

    const editorId = `editor-${index}`;
    initializedEditors.current.delete(editorId);

    if (quillRefs.current[index]) {
      delete quillRefs.current[index];
    }

    const newPages = livePages.filter((_, i) => i !== index);
    setLivePages(newPages);

    if (selectedPageIndex >= newPages.length) {
      setSelectedPageIndex(newPages.length - 1);
    }
  };

  const saveAllPages = async () => {
    setLoading(true);

    const pagesToSave = livePages
      .map(page => ({
        content: page.content,
        existingPageId: page.existingPageId
      }))
      .filter(page => page.content && page.content.trim() !== '' && page.content !== '<p><br></p>');

    if (pagesToSave.length === 0) {
      alert('No content to save!');
      setLoading(false);
      return;
    }

    let savedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (let page of pagesToSave) {
      try {
        if (page.existingPageId) {
          const res = await fetch('/api/author/pages', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: page.existingPageId,
              content: page.content.trim()
            })
          });

          const data = await res.json();
          if (data.success) {
            updatedCount++;
          } else {
            failedCount++;
          }
        } else {
          // For topic pages, subtopic_id will be NULL
          const pageData = {
            topic_id: topicId,
            subtopic_id: null,
            content: page.content.trim()
          };

          const res = await fetch('/api/author/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pageData)
          });

          const data = await res.json();
          if (data.success) {
            savedCount++;
          } else {
            failedCount++;
          }
        }
      } catch (error) {
        failedCount++;
      }
    }

    if (savedCount > 0 || updatedCount > 0) {
      let message = '✅ Success!\n';
      if (savedCount > 0) message += `Created ${savedCount} new page(s)\n`;
      if (updatedCount > 0) message += `Updated ${updatedCount} page(s)\n`;
      if (failedCount > 0) message += `⚠️ Failed: ${failedCount} page(s)`;

      alert(message);
      await fetchPages();
      // router.push('/author/books');
    } else {
      alert('❌ Failed to save pages. Please try again.');
    }

    setLoading(false);
  };

  const loadExistingPage = (page) => {
    setLivePages([{
      id: `page-${page.id}`,
      content: page.content,
      existingPageId: page.id
    }]);
    setEditingPageId(page.id);
    setSelectedPageIndex(0);
    
    setTimeout(() => {
      initializedEditors.current.clear();
      Object.keys(quillRefs.current).forEach(key => {
        const container = document.getElementById(`editor-${key}`);
        if (container?.parentNode) {
          const toolbar = container.parentNode.querySelector('.ql-toolbar');
          if (toolbar) toolbar.remove();
        }
        delete quillRefs.current[key];
      });
      
      setTimeout(() => {
        initQuill(0);
      }, 100);
    }, 100);
  };

  const handleEditExistingPage = (page) => {
    if (!page || !page.content) {
      alert('Invalid page data');
      return;
    }

    Object.keys(quillRefs.current).forEach(key => {
      const quill = quillRefs.current[key];
      if (quill && quill.container) {
        const parent = quill.container.parentNode;
        if (parent) {
          parent.innerHTML = '';
        }
      }
    });
    quillRefs.current = {};
    initializedEditors.current.clear();

    setEditingPageId(page.id);
    setSelectedPageIndex(0);
    
    const newPage = {
      id: `edit-${Date.now()}`,
      content: page.content,
      existingPageId: page.id
    };
    
    setLivePages([newPage]);

    setTimeout(() => {
      if (topRef.current) {
        topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      
      const container = document.getElementById('editor-0');
      
      if (!container || !window.Quill) return;

      container.innerHTML = '';
      
       const quill = new window.Quill('#editor-0', {
        theme: 'snow',
        modules: {
        toolbar: [
  [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
  [{ 'font': [] }],  // Font family selector
  [{ 'size': ['small', false, 'large', 'huge'] }],  // Font size
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'color': [] }, { 'background': [] }],
  [{ 'script': 'sub'}, { 'script': 'super' }],  // Subscript/Superscript
  [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],  // Checklist
  [{ 'indent': '-1'}, { 'indent': '+1' }],  // Indent/outdent
  [{ 'direction': 'rtl' }],  // Text direction
  [{ 'align': [] }],
  ['blockquote', 'code-block'],  // Blockquote and code block
  ['link', 'image'],  // Video embedding
  ['clean']  // Remove formatting
], imageResize: {
    modules: ['Resize', 'DisplaySize', 'Toolbar']
  },

        },
        placeholder: 'Edit your content...'
      });



      quill.root.innerHTML = page.content;

      // Snapshot safe HTML so we can revert if user overflows the A4 page
      quill.__lastSafeHtml = quill.root.innerHTML;

      quill.on('text-change', (delta, oldDelta, source) => {
        const content = quill.root.innerHTML;

        if (source === 'user') {
          // measure rendered height
          let contentHeight = 0;
          try {
            const temp = document.createElement('div');
            temp.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;width:${CONTENT_WIDTH}px;padding:0;font-size:16px;line-height:1.6;font-family:'Georgia', 'Times New Roman', serif;word-wrap:break-word;overflow-wrap:break-word;`;
            temp.innerHTML = content || '';
            document.body.appendChild(temp);
            contentHeight = temp.scrollHeight || 0;
            document.body.removeChild(temp);
          } catch (e) {
            contentHeight = quill.root.scrollHeight || 0;
          }

          if (contentHeight > CONTENT_HEIGHT) {
            // revert to last safe
            quill.root.innerHTML = quill.__lastSafeHtml || '';
            try { quill.setSelection(quill.getLength(), 0); } catch(e) {}
            const pageHeader = container.closest('.page-editor-container')?.querySelector('.page-header');
            if (pageHeader) {
              const old = pageHeader.style.background;
              pageHeader.style.background = '#fee2e2';
              setTimeout(() => pageHeader.style.background = old, 600);
            }
            return;
          }
        }

        setLivePages(prev => {
          const updated = [...prev];
          updated[0] = { ...updated[0], content };
          return updated;
        });

        quill.__lastSafeHtml = quill.root.innerHTML;
        updatePageStatus(quill, container);
      });

      quillRefs.current[0] = quill;
      initializedEditors.current.add('editor-0');
      
      setTimeout(() => {
        updatePageStatus(quill, container);
      }, 100);
    }, 600);
  };

  const handleDeleteExistingPage = async (id) => {
    if (!confirm('Delete this page permanently?')) return;

    const res = await fetch(`/api/author/pages?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchPages();
      alert('Page deleted successfully!');
    } else {
      alert('Failed to delete page');
    }
  };

  const createNewContent = () => {
    setLivePages([{ id: 'page-1', content: '', existingPageId: null }]);
    setEditingPageId(null);
    setSelectedPageIndex(0);
    
    setTimeout(() => {
      initializedEditors.current.clear();
      Object.keys(quillRefs.current).forEach(key => {
        const container = document.getElementById(`editor-${key}`);
        if (container?.parentNode) {
          const toolbar = container.parentNode.querySelector('.ql-toolbar');
          if (toolbar) toolbar.remove();
        }
        delete quillRefs.current[key];
      });
      
      setTimeout(() => {
        initQuill(0);
      }, 100);
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8" ref={topRef}>
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center space-x-2 text-sm">
            <li>
              <button onClick={() => router.push('/author/books')} className="text-indigo-600 hover:text-indigo-800">
                Books
              </button>
            </li>
            <li className="text-gray-400">/</li>
            <li>
              <span className="text-gray-600">{bookTitle}</span>
            </li>
            <li className="text-gray-400">/</li>
            <li className="text-gray-900 font-semibold">{topicTitle}</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📖 {topicTitle}
          </h1>
          <p className="text-gray-600">
            Add pages directly to this topic
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left sidebar removed - editor takes full width */}

          {/* Editor (full width) */}
          <div className="lg:col-span-12">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingPageId ? 'Edit Page' : 'Create New Pages'}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={addNewPage}
                    disabled={splitting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                  >
                    + Add Page
                  </button>
                  <button
                    onClick={saveAllPages}
                    disabled={loading || splitting}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition font-medium"
                  >
                    {loading ? 'Saving...' : 'Save All Pages'}
                  </button>
                </div>
              </div>

              {/* Pages Editor */}
              <div className="space-y-6">
                {livePages.map((page, index) => (
                  <div key={page.id} className="page-editor-container border border-gray-300 rounded-lg overflow-hidden">
                    <div className="page-header flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div className="flex items-center">
                        <span className="text-sm font-semibold text-gray-900">
                          Page {index + 1}
                        </span>
                        <span className="page-status ml-3 text-xs font-semibold text-gray-600">
                          0% filled
                        </span>
                      </div>
                      {livePages.length > 1 && (
                        <button
                          onClick={() => deletePage(index)}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                    <div
                      id={`editor-${index}`}
                      className="quill-editor"
                      style={{
                        minHeight: `${CONTENT_HEIGHT}px`,
                        maxHeight: `${CONTENT_HEIGHT}px`,
                        overflow: 'auto'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Saved Pages Section */}
        <div className="mt-8 lg:mt-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">📚 Saved A4 Pages ({pages.length})</h2>

          {pages.length === 0 ? (
            <div className="bg-white p-12 rounded-xl shadow-lg text-center text-gray-500 border border-gray-200">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">No saved pages yet</p>
              <p className="text-sm mt-1">Create your first page to get started</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {pages.map((page, index) => (
                <div 
                  key={page.id} 
                  className={`bg-white rounded-xl shadow-lg border transition-all ${
                    editingPageId === page.id ? 'ring-4 ring-yellow-400' : 'border-gray-200'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                      <div className="flex-1">
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-full">
                          A4 Page {index + 1}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          ({countWords(page.content || '')} words)
                        </span>
                        {editingPageId === page.id && (
                          <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                            Currently Editing
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleEditExistingPage(page)}
                          disabled={editingPageId === page.id}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-md"
                        >
                          {editingPageId === page.id ? '✏️ Editing...' : '✏️ Edit'}
                        </button>
                        <button 
                          onClick={() => handleDeleteExistingPage(page.id)}
                          disabled={editingPageId === page.id}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-md"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-96 overflow-y-auto saved-a4-content">
                      <div dangerouslySetInnerHTML={{ __html: page.content }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <style jsx global>{`
        .page-wrapper {
          width: 100%;
          display: flex;
          justify-content: center;
          gap: 20px;
          flex-wrap: wrap;
          padding: 0 12px;
          margin: 20px 0;
        }

        .page-editor-container {
          width: 100%;
          max-width: ${PAGE_WIDTH}px;
          height: ${PAGE_HEIGHT + 40}px;
          background: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border-radius: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          transition: box-shadow 0.2s ease;
          margin: 12px auto;
        }

        /* Ensure default text is black, but don't override inline color styles (so color picker still works) */
        .page-editor-container { color: #000000; }
        .ql-container:not([style*="color"]) { color: #000000; }
        .ql-editor:not([style*="color"]) { color: #000000; }

        /* Mobile: Allow horizontal scroll to see full page */
        @media (max-width: 820px) {
          .page-wrapper {
            overflow-x: auto;
            justify-content: flex-start;
          }
          .page-editor-container {
            flex-shrink: 0;
          }
        }

        .page-header {
          height: ${HEADER_HEIGHT}px;
          padding: 12px ${CONTENT_PADDING}px;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.3s;
          flex-shrink: 0;
        }

        .ql-toolbar {
          flex-shrink: 0;
          border-bottom: 1px solid #e5e7eb !important;
          border-left: none !important;
          border-right: none !important;
          border-top: none !important;
        }

        .ql-container {
          font-size: 16px !important;
          line-height: 1.6 !important;
          font-family: Arial, sans-serif !important;
          height: ${CONTENT_HEIGHT}px !important;
          flex: none !important;
          border: none !important;
          overflow: hidden !important;
        }

        .ql-editor {
          padding: ${CONTENT_PADDING}px !important;
          overflow-y: auto !important;
          height: 100% !important;
          box-sizing: border-box !important;
        }

        .page-footer {
          height: ${FOOTER_HEIGHT}px;
          padding: 12px 0;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #6b7280;
          flex-shrink: 0;
        }

        .ql-editor p {
          margin-bottom: 0.8em;
          margin-top: 0;
        }

        .ql-editor h1,
        .ql-editor h2,
        .ql-editor h3 {
          margin-bottom: 0.6em;
          margin-top: 0.6em;
        }

        .ql-editor ul, .ql-editor ol {
          margin-bottom: 0.8em;
        }

        /* Saved pages default text color */
        .saved-a4-content { color: #000000; }
        .saved-a4-content *:not([style*="color"]) { color: #000000; }
      `}</style>
    </div>
  );
}
