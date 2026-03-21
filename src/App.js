import React from 'react';
import './App.css';
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.js"
import Routing from './Router/Routing';
import Navbar from './componets/Navbar'
import Footer from './componets/Footer'




function App() {
  return (
   <>
   <Navbar/> 
    <Routing/>
    <Footer/>
   </>
  );
}

export default App;
