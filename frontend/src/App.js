// client/src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import TrackingPage from './Track';
import Main from './Main';
import RedirectPage from './Redirect';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route exact path="/track" element={<TrackingPage />} />
        <Route path='/' element={<Main/>}/>
        <Route path='/:shortCode' element={<RedirectPage />}/>
      </Routes>
      <Analytics />
    </Router>
  );
};

export default App;
