// app/author/books/page.jsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthorBooksPage() {
  const router = useRouter();
  const [books, setBooks] = useState([]);
  const [bookTitle, setBookTitle] = useState('');
  const [currentBookId, setCurrentBookId] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [expandedBooks, setExpandedBooks] = useState({});
  const [expandedTopics, setExpandedTopics] = useState({});
  const [editingBookId, setEditingBookId] = useState(null);
  const savingTopics = useRef(new Set());
  const savingSubtopics = useRef(new Set());

  useEffect(() => {
    fetchBooks();
    
    // Restore form state from localStorage
    const savedFormState = localStorage.getItem('bookFormState');
    if (savedFormState) {
      const formState = JSON.parse(savedFormState);
      setBookTitle(formState.bookTitle || '');
      setCurrentBookId(formState.currentBookId || null);
      setTopics(formState.topics || []);
      setShowForm(true);
    }
  }, []);

  const fetchBooks = async () => {
    const res = await fetch('/api/author/books');
    const data = await res.json();
    if (data.success) setBooks(data.data);
  };

  const saveFormState = (title, bookId, topicsData) => {
    localStorage.setItem('bookFormState', JSON.stringify({
      bookTitle: title,
      currentBookId: bookId,
      topics: topicsData
    }));
  };

  const clearFormState = () => {
    localStorage.removeItem('bookFormState');
  };

  const handleAddTopic = async () => {
    if (!bookTitle.trim()) {
      alert('Please enter a book title first');
      return;
    }

    // Create book if not already created
    if (!currentBookId) {
      const res = await fetch('/api/author/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: bookTitle })
      });
      
      const data = await res.json();
      if (data.success) {
        const newBookId = data.bookId;
        const newTopics = [...topics, { id: Date.now(), name: '', hasSubtopics: false, topicId: null, subtopics: [] }];
        setCurrentBookId(newBookId);
        setTopics(newTopics);
        saveFormState(bookTitle, newBookId, newTopics);
      } else {
        alert('Error: ' + data.error);
      }
    } else {
      const newTopics = [...topics, { id: Date.now(), name: '', hasSubtopics: false, topicId: null, subtopics: [] }];
      setTopics(newTopics);
      saveFormState(bookTitle, currentBookId, newTopics);
    }
  };

  const handleRemoveTopic = async (index) => {
    const topic = topics[index];
    
    // If topic has ID, delete from database first
    if (topic.topicId) {
      if (!confirm(`Are you sure you want to delete "${topic.name}"? This will also delete all its subtopics and pages.`)) {
        return;
      }
      
      setLoading(true);
      try {
        const res = await fetch(`/api/author/topics?id=${topic.topicId}`, {
          method: 'DELETE'
        });
        
        const data = await res.json();
        if (!data.success) {
          alert('Error deleting topic: ' + data.error);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error deleting topic:', error);
        alert('Failed to delete topic');
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    
    // Remove from local state
    const newTopics = topics.filter((_, i) => i !== index);
    setTopics(newTopics);
    saveFormState(bookTitle, currentBookId, newTopics);
  };

  const handleTopicChange = (index, value) => {
    const newTopics = [...topics];
    newTopics[index].name = value;
    setTopics(newTopics);
    saveFormState(bookTitle, currentBookId, newTopics);
  };

  const handleTopicBlur = async (index) => {
    const topic = topics[index];
    
    if (!topic.name.trim()) return;
    
    const saveKey = `topic-${index}`;
    
    if (savingTopics.current.has(saveKey)) return;
    
    savingTopics.current.add(saveKey);
    setLoading(true);
    
    try {
      if (topic.topicId) {
        // Update existing topic
        const res = await fetch('/api/author/topics', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: topic.topicId,
            name: topic.name
          })
        });
        
        const data = await res.json();
        if (!data.success) {
          alert('Error updating topic: ' + data.error);
        }
      } else {
        // Create new topic
        const res = await fetch('/api/author/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: topic.name, 
            book_id: currentBookId 
          })
        });
        
        const data = await res.json();
        if (data.success) {
          const newTopics = [...topics];
          newTopics[index].topicId = data.topicId;
          setTopics(newTopics);
          saveFormState(bookTitle, currentBookId, newTopics);
        } else {
          alert('Error: ' + data.error);
        }
      }
    } catch (error) {
      console.error('Error saving topic:', error);
    }
    
    savingTopics.current.delete(saveKey);
    setLoading(false);
  };

  const handleAddPages = async (index) => {
    const topic = topics[index];
    
    if (!topic.name.trim()) {
      alert('Please enter topic name first');
      return;
    }
    
    const saveKey = `topic-${index}`;
    
    // If topic not saved, save it first
    if (!topic.topicId) {
      if (savingTopics.current.has(saveKey)) {
        // Wait for the ongoing save to complete (poll every 200ms, max 15 seconds)
        setLoading(true);
        const startTime = Date.now();
        while (savingTopics.current.has(saveKey) && Date.now() - startTime < 15000) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Check if save completed successfully
        const updatedTopic = topics[index];
        if (!updatedTopic.topicId) {
          alert('Topic save failed, please try again');
          setLoading(false);
          return;
        }
        
        // Save completed, navigate to pages
        setLoading(false);
        router.push(`/author/pages/topic/${updatedTopic.topicId}`);
        return;
      }
      
      savingTopics.current.add(saveKey);
      setLoading(true);
      const res = await fetch('/api/author/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: topic.name, 
          book_id: currentBookId 
        })
      });
      
      const data = await res.json();
      savingTopics.current.delete(saveKey);
      if (data.success) {
        const newTopics = [...topics];
        newTopics[index].topicId = data.topicId;
        setTopics(newTopics);
        saveFormState(bookTitle, currentBookId, newTopics);
        setLoading(false);
        router.push(`/author/pages/topic/${data.topicId}`);
      } else {
        alert('Error: ' + data.error);
        setLoading(false);
      }
    } else {
      router.push(`/author/pages/topic/${topic.topicId}`);
    }
  };

  const handleAddSubtopic = async (topicIndex) => {
    const topic = topics[topicIndex];
    
    if (!topic.name.trim()) {
      alert('Please enter topic name first');
      return;
    }
    
    const saveKey = `topic-${topicIndex}`;
    
    // If topic not saved, save it first
    if (!topic.topicId) {
      if (savingTopics.current.has(saveKey)) {
        // Wait for the ongoing save to complete (poll every 200ms, max 15 seconds)
        setLoading(true);
        const startTime = Date.now();
        while (savingTopics.current.has(saveKey) && Date.now() - startTime < 15000) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Check if save completed successfully
        const updatedTopic = topics[topicIndex];
        if (!updatedTopic.topicId) {
          alert('Topic save failed, please try again');
          setLoading(false);
          return;
        }
        
        // Save completed, now add subtopic
        const newTopics = [...topics];
        newTopics[topicIndex].hasSubtopics = true;
        newTopics[topicIndex].subtopics.push({
          id: Date.now(),
          name: '',
          subtopicId: null
        });
        setTopics(newTopics);
        saveFormState(bookTitle, currentBookId, newTopics);
        setLoading(false);
        return;
      }
      
      savingTopics.current.add(saveKey);
      setLoading(true);
      const res = await fetch('/api/author/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: topic.name, 
          book_id: currentBookId 
        })
      });
      
      const data = await res.json();
      savingTopics.current.delete(saveKey);
      if (data.success) {
        const newTopics = [...topics];
        newTopics[topicIndex].topicId = data.topicId;
        newTopics[topicIndex].hasSubtopics = true;
        newTopics[topicIndex].subtopics.push({
          id: Date.now(),
          name: '',
          subtopicId: null
        });
        setTopics(newTopics);
        saveFormState(bookTitle, currentBookId, newTopics);
        setLoading(false);
      } else {
        alert('Error: ' + data.error);
        setLoading(false);
      }
    } else {
      const newTopics = [...topics];
      newTopics[topicIndex].hasSubtopics = true;
      newTopics[topicIndex].subtopics.push({
        id: Date.now(),
        name: '',
        subtopicId: null
      });
      setTopics(newTopics);
      saveFormState(bookTitle, currentBookId, newTopics);
    }
  };

  const handleSubtopicChange = (topicIndex, subtopicIndex, value) => {
    const newTopics = [...topics];
    newTopics[topicIndex].subtopics[subtopicIndex].name = value;
    setTopics(newTopics);
    saveFormState(bookTitle, currentBookId, newTopics);
  };

  const handleSubtopicBlur = async (topicIndex, subtopicIndex) => {
    const topic = topics[topicIndex];
    const subtopic = topic.subtopics[subtopicIndex];
    
    if (!subtopic.name.trim()) return;
    
    const saveKey = `${topicIndex}-${subtopicIndex}`;
    
    if (savingSubtopics.current.has(saveKey)) return;
    
    savingSubtopics.current.add(saveKey);
    setLoading(true);
    
    try {
      if (subtopic.subtopicId) {
        // Update existing subtopic
        const res = await fetch('/api/author/subtopics', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: subtopic.subtopicId,
            name: subtopic.name
          })
        });
        
        const data = await res.json();
        if (!data.success) {
          alert('Error updating subtopic: ' + data.error);
        }
      } else {
        // Create new subtopic
        const res = await fetch('/api/author/subtopics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: subtopic.name,
            book_id: currentBookId,
            topic_id: topic.topicId
          })
        });
        
        const data = await res.json();
        if (data.success) {
          const newTopics = [...topics];
          newTopics[topicIndex].subtopics[subtopicIndex].subtopicId = data.id;
          setTopics(newTopics);
          saveFormState(bookTitle, currentBookId, newTopics);
        } else {
          alert('Error: ' + data.error);
        }
      }
    } catch (error) {
      console.error('Error saving subtopic:', error);
    }
    
    savingSubtopics.current.delete(saveKey);
    setLoading(false);
  };

  const handleRemoveSubtopic = async (topicIndex, subtopicIndex) => {
    const subtopic = topics[topicIndex].subtopics[subtopicIndex];
    
    // If subtopic has ID, delete from database first
    if (subtopic.subtopicId) {
      if (!confirm(`Are you sure you want to delete "${subtopic.name}"? This will also delete all its pages.`)) {
        return;
      }
      
      setLoading(true);
      try {
        const res = await fetch(`/api/author/subtopics?id=${subtopic.subtopicId}`, {
          method: 'DELETE'
        });
        
        const data = await res.json();
        if (!data.success) {
          alert('Error deleting subtopic: ' + data.error);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error deleting subtopic:', error);
        alert('Failed to delete subtopic');
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    
    // Remove from local state
    const newTopics = [...topics];
    newTopics[topicIndex].subtopics.splice(subtopicIndex, 1);
    
    // If no subtopics left, allow adding pages to topic again
    if (newTopics[topicIndex].subtopics.length === 0) {
      newTopics[topicIndex].hasSubtopics = false;
    }
    
    setTopics(newTopics);
    saveFormState(bookTitle, currentBookId, newTopics);
  };

  const handleAddPagesToSubtopic = async (topicIndex, subtopicIndex) => {
    const topic = topics[topicIndex];
    const subtopic = topic.subtopics[subtopicIndex];
    
    if (!subtopic.name.trim()) {
      alert('Please enter subtopic name first');
      return;
    }
    
    const saveKey = `${topicIndex}-${subtopicIndex}`;
    
    // If subtopic not saved yet, save it first
    if (!subtopic.subtopicId) {
      if (savingSubtopics.current.has(saveKey)) {
        // Wait for the ongoing save to complete (poll every 200ms, max 15 seconds)
        setLoading(true);
        const startTime = Date.now();
        while (savingSubtopics.current.has(saveKey) && Date.now() - startTime < 15000) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Check if save completed successfully
        const updatedSubtopic = topics[topicIndex].subtopics[subtopicIndex];
        if (!updatedSubtopic.subtopicId) {
          alert('Subtopic save failed, please try again');
          setLoading(false);
          return;
        }
        
        // Save completed, navigate to pages
        setLoading(false);
        router.push(`/author/pages/${updatedSubtopic.subtopicId}`);
        return;
      }
      
      savingSubtopics.current.add(saveKey);
      setLoading(true);
      const res = await fetch('/api/author/subtopics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: subtopic.name,
          book_id: currentBookId,
          topic_id: topic.topicId
        })
      });
      
      const data = await res.json();
      savingSubtopics.current.delete(saveKey);
      if (data.success) {
        const newTopics = [...topics];
        newTopics[topicIndex].subtopics[subtopicIndex].subtopicId = data.id;
        setTopics(newTopics);
        saveFormState(bookTitle, currentBookId, newTopics);
        setLoading(false);
        router.push(`/author/pages/${data.id}`);
      } else {
        alert('Error: ' + data.error);
        setLoading(false);
      }
    } else {
      router.push(`/author/pages/${subtopic.subtopicId}`);
    }
  };

  const handleReset = () => {
    setBookTitle('');
    setCurrentBookId(null);
    setTopics([]);
    setShowForm(false);
    setEditingBookId(null);
    clearFormState();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (editingBookId) {
      // Update existing book title
      const res = await fetch('/api/author/books', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: editingBookId,
          title: bookTitle 
        })
      });
      
      const data = await res.json();
      if (data.success) {
        await fetchBooks();
        handleReset();
        alert('Book updated successfully!');
      } else {
        alert('Error: ' + data.error);
      }
    } else {
      // Create new book - topics should already be saved via auto-save
      // Just finalize and close the form
      if (!currentBookId) {
        alert('Please add at least one topic before finishing');
        return;
      }
      await fetchBooks();
      handleReset();
      alert('Book created successfully!');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this book? All topics and pages will also be deleted.')) return;
    
    const res = await fetch(`/api/author/books?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchBooks();
      alert('Book deleted successfully!');
    } else {
      alert('Error: ' + data.error);
    }
  };

  const handleEdit = (book) => {
    setEditingBookId(book.id);
    setBookTitle(book.title);
    setCurrentBookId(book.id);
    
    // Load topics with subtopics
    const loadedTopics = book.topics.map((topic, idx) => ({
      id: Date.now() + idx,
      name: topic.name,
      topicId: topic.id,
      hasSubtopics: topic.subtopics && topic.subtopics.length > 0,
      subtopics: (topic.subtopics || []).map((subtopic, subIdx) => ({
        id: Date.now() + idx * 1000 + subIdx,
        name: subtopic.name,
        subtopicId: subtopic.id
      }))
    }));
    
    setTopics(loadedTopics);
    setShowForm(true);
    saveFormState(book.title, book.id, loadedTopics);
  };

  const toggleBookExpansion = (bookId) => {
    setExpandedBooks(prev => ({
      ...prev,
      [bookId]: !prev[bookId]
    }));
  };

  const toggleTopicExpansion = (topicId) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicId]: !prev[topicId]
    }));
  };

  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="min-h-full bg-gray-50">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    
    {/* Header Section */}
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Books</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create and manage your books
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              handleReset();
            } else {
              setShowForm(true);
            }
          }}
          className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-lg hover:shadow-xl"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {showForm ? 'Cancel' : 'Create New Book'}
        </button>
      </div>
    </div>

    {/* Add Book Form */}
    {showForm && (
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-8 border border-gray-200 animate-slideDown">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
            {editingBookId ? '✏️ Edit Book' : '📚 Create New Book'}
          </h2>
          <button
            onClick={handleReset}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Book Title *
            </label>
            <input
              type="text"
              placeholder="Enter book title"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-black"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              required
            />
          </div>

          {/* Topics Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Topics * {topics.length > 0 && `(${topics.length})`}
              </label>
              <button
                type="button"
                onClick={handleAddTopic}
                className="inline-flex items-center px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Topic
              </button>
            </div>

            {topics.length === 0 && (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-lg">
                Click "Add Topic" button to add topics for this book
              </div>
            )}

            {/* Topics List */}
            {topics.length > 0 && (
              <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
                {topics.map((topic, index) => (
                  <div key={topic.id} className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                    <div className="flex gap-2 items-start mb-3">
                      <span className="text-sm font-medium text-gray-600 min-w-[24px] sm:min-w-[30px] mt-2">
                        {index + 1}.
                      </span>
                      <input
                        type="text"
                        placeholder="Enter topic name"
                        className="flex-1 px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-black "
                        value={topic.name}
                        onChange={(e) => handleTopicChange(index, e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveTopic(index)}
                        className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition flex-shrink-0"
                        title="Remove topic"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2 ml-6 sm:ml-8">
                      <button
                        type="button"
                        onClick={() => handleAddPages(index)}
                        disabled={topic.hasSubtopics}
                        className={`flex-1 px-3 py-2 rounded-lg transition text-sm font-medium ${
                          topic.hasSubtopics
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                        }`}
                      >
                        <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Add Pages
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddSubtopic(index)}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
                      >
                        <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Subtopic
                      </button>
                    </div>
                    
                    {topic.topicId && (
                      <div className="mt-2 ml-6 sm:ml-8 flex flex-wrap gap-2">
                        <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                          ✓ Saved
                        </span>
                        {topic.hasSubtopics && (
                          <span className="inline-flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                            Has {topic.subtopics.length} Subtopic(s)
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Subtopics Section */}
                    {topic.hasSubtopics && topic.subtopics.length > 0 && (
                      <div className="ml-6 sm:ml-8 mt-3 space-y-3 border-l-2 border-green-300 pl-3 sm:pl-4">
                        {topic.subtopics.map((subtopic, subIdx) => (
                          <div key={subtopic.id} className="bg-green-50 p-3 rounded-lg border border-green-200">
                            <div className="flex gap-2 items-start mb-2">
                              <span className="text-xs font-medium text-gray-600 min-w-[35px] sm:min-w-[40px] mt-2">
                                {index + 1}.{subIdx + 1}
                              </span>
                              <input
                                type="text"
                                placeholder="Enter subtopic name"
                                className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-sm text-black"
                                value={subtopic.name}
                                onChange={(e) => handleSubtopicChange(index, subIdx, e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => handleAddPagesToSubtopic(index, subIdx)}
                                className="px-2 sm:px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-xs font-medium flex-shrink-0"
                              >
                                <svg className="w-3 h-3 inline sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="hidden sm:inline">Pages</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSubtopic(index, subIdx)}
                                className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition flex-shrink-0"
                                title="Delete subtopic"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                            {subtopic.subtopicId && (
                              <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium ml-10 sm:ml-12">
                                ✓ Saved
                              </span>
                            )}
                          </div>
                        ))}
                        
                        <button
                          type="button"
                          onClick={() => handleAddSubtopic(index)}
                          className="w-full px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition text-sm font-medium border border-green-300"
                        >
                          + Add Another Subtopic
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              type="submit" 
              disabled={loading}
              className="w-full sm:w-auto sm:flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-lg hover:shadow-xl font-medium"
            >
              {loading ? 'Saving...' : (editingBookId ? 'Update Book' : 'Done')}
            </button>
            <button 
              type="button"
              onClick={handleReset}
              className="w-full sm:w-auto px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    )}

    {/* Search & Filter */}
    <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-6 border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 p-3 rounded-lg">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{books.length}</p>
            <p className="text-sm text-gray-600">Total Books</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search books..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-black"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <svg className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
    </div>

    {/* Books Table - Desktop Only */}
    <div className="hidden md:block bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Book Title</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Topics</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Created</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredBooks.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-lg font-medium">No books found</p>
                  <p className="text-sm mt-1">Create your first book to get started</p>
                </td>
              </tr>
            ) : (
              filteredBooks.map((book) => (
                <>
                  {/* Main Book Row */}
                  <tr key={book.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleBookExpansion(book.id)}
                          className="p-1 hover:bg-gray-200 rounded transition"
                        >
                          <svg 
                            className={`w-5 h-5 text-gray-600 transition-transform ${expandedBooks[book.id] ? 'rotate-90' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                          {book.title.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{book.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                        {book.topics?.length || 0} Topics
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(book.created_at).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleEdit(book)}
                          className="inline-flex items-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium"
                          title="Edit Book"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleDelete(book.id)}
                          className="inline-flex items-center px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm font-medium"
                          title="Delete Book"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Topics Rows */}
                  {expandedBooks[book.id] && book.topics && book.topics.length > 0 && (
                    book.topics.map((topic, idx) => (
                      <>
                        <tr key={`topic-${topic.id}`} className="bg-gray-50">
                          <td className="px-6 py-3" colSpan="2">
                            <div className="flex items-center gap-3 ml-12">
                              <button
                                onClick={() => toggleTopicExpansion(topic.id)}
                                className="p-1 hover:bg-gray-300 rounded transition"
                              >
                                <svg 
                                  className={`w-4 h-4 text-gray-600 transition-transform ${expandedTopics[topic.id] ? 'rotate-90' : ''}`}
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                                {idx + 1}
                              </div>
                              <span className="text-sm font-medium text-gray-700">{topic.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                              Topic
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-500">
                            {topic.subtopic_count || 0} Subtopics
                          </td>
                        </tr>

                        {/* Expanded Subtopics Rows */}
                        {expandedTopics[topic.id] && topic.subtopics && topic.subtopics.length > 0 && (
                          topic.subtopics.map((subtopic, subIdx) => (
                            <tr key={`subtopic-${subtopic.id}`} className="bg-green-50">
                              <td className="px-6 py-2" colSpan="2">
                                <div className="flex items-center gap-3 ml-24">
                                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">
                                    {idx + 1}.{subIdx + 1}
                                  </div>
                                  <span className="text-xs font-medium text-gray-700">{subtopic.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-2">
                                <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                                  Subtopic
                                </span>
                              </td>
                              <td className="px-6 py-2 text-xs text-gray-500">
                                {subtopic.description || 'No description'}
                              </td>
                            </tr>
                          ))
                        )}
                      </>
                    ))
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* Books Accordion - Mobile Only */}
    <div className="md:hidden space-y-3">
      {filteredBooks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center border border-gray-200">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-lg font-medium text-gray-900">No books found</p>
          <p className="text-sm text-gray-600 mt-1">Create your first book to get started</p>
        </div>
      ) : (
        filteredBooks.map((book) => (
          <div key={book.id} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            {/* Book Header - Always Visible */}
            <button
              onClick={() => toggleBookExpansion(book.id)}
              className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors active:bg-gray-100"
            >
              <svg 
                className={`w-5 h-5 text-gray-600 transition-transform flex-shrink-0 ${expandedBooks[book.id] ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {book.title.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 text-left min-w-0">
                <h3 className="font-semibold text-gray-900 text-base truncate">{book.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                    {book.topics?.length || 0} Topics
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(book.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </button>

            {/* Book Content - Expandable */}
            <div className={`transition-all duration-300 ease-in-out ${expandedBooks[book.id] ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
              {/* Book Actions */}
              <div className="px-4 pb-3 pt-2 bg-gray-50 border-t border-gray-200 flex gap-2">
                <button 
                  onClick={() => handleEdit(book)}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium active:bg-blue-300"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button 
                  onClick={() => handleDelete(book.id)}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm font-medium active:bg-red-300"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>

              {/* Topics List */}
              {book.topics && book.topics.length > 0 && (
                <div className="bg-gray-50 border-t border-gray-200">
                  {book.topics.map((topic, idx) => (
                    <div key={topic.id} className="border-b border-gray-200 last:border-b-0">
                      {/* Topic Header - Always Visible */}
                      <button
                        onClick={() => toggleTopicExpansion(topic.id)}
                        className="w-full p-3 pl-8 flex items-center gap-3 hover:bg-gray-100 transition-colors active:bg-gray-200"
                      >
                        <svg 
                          className={`w-4 h-4 text-gray-600 transition-transform flex-shrink-0 ${expandedTopics[topic.id] ? 'rotate-90' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{topic.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{topic.subtopic_count || 0} Subtopics</p>
                        </div>
                      </button>

                      {/* Subtopics List - Expandable */}
                      <div className={`transition-all duration-300 ease-in-out ${expandedTopics[topic.id] ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                        {topic.subtopics && topic.subtopics.length > 0 ? (
                          <div className="bg-green-50 pb-2">
                            {topic.subtopics.map((subtopic, subIdx) => (
                              <div key={subtopic.id} className="px-3 py-2 pl-16 flex items-start gap-2 border-t border-green-100">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5">
                                  {idx + 1}.{subIdx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900">{subtopic.name}</p>
                                  {subtopic.description && (
                                    <p className="text-xs text-gray-500 mt-0.5">{subtopic.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-3 pl-16 text-xs text-gray-500 italic bg-green-50 border-t border-green-100">
                            No subtopics yet
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(!book.topics || book.topics.length === 0) && (
                <div className="px-4 py-4 text-center text-sm text-gray-500 italic bg-gray-50 border-t border-gray-200">
                  No topics added yet
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>

  <style jsx>{`
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .animate-slideDown {
      animation: slideDown 0.3s ease-out;
    }
    
    /* Smooth scrolling for nested accordions */
    @media (max-width: 768px) {
      .max-h-0 {
        overflow: hidden;
      }
    }
  `}</style>
</div>

  );
}
