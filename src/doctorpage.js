
import React from 'react'

const Doctorpage = () => {
    
  return (
    <div className='container my-5'>
     <div id="carouselExampleIndicators" className="carousel slide w-50">

      {/* Indicators */}
      <div className="carousel-indicators">
        <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="0" className="active"></button>
        <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="1"></button>
        <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="2"></button>
      </div>

      {/* Slides */} 
      <div className="carousel-inner">

        <div className="carousel-item active">
          <img src="https://static01.nyt.com/images/2017/02/16/well/doctors-hospital-design/doctors-hospital-design-superJumbo.jpg" className="d-block w-100" alt="doctor1" />
        </div>

        <div className="carousel-item">
          <img src="https://static01.nyt.com/images/2017/02/16/well/doctors-hospital-design/doctors-hospital-design-superJumbo.jpg" className="d-block w-100" alt="doctor2" />
        </div>

        <div className="carousel-item">
          <img src="https://static01.nyt.com/images/2017/02/16/well/doctors-hospital-design/doctors-hospital-design-superJumbo.jpg" className="d-block w-100" alt="doctor3" />
        </div>

      </div>

      {/* Controls */}
      <button className="carousel-control-prev" type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide="prev">
        <span className="carousel-control-prev-icon"></span>
      </button>

      <button className="carousel-control-next" type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide="next">
        <span className="carousel-control-next-icon"></span>
      </button>

      <button className="btn btn-primary mt-3" type="button">Book an Appointment</button>

        <h5>Select Slot</h5>
        <select
          className="form-select mb-3"


        >
          <option value="">Choose Slot</option>
          <option>10:00 AM</option>
          <option>11:00 AM</option>
          <option>12:00 PM</option>
          <option>2:00 PM</option>
          <option>4:00 PM</option>
          <option>5:00 PM</option>
        </select>

        <button
          className="btn btn-success w-100"

        >
          Book Now
        </button>
        </div>
     <h4 className='my-4'>Dr. John Doe</h4>
     <p>Dr. John Doe is a highly skilled and compassionate physician with over 15 years of experience in the medical field. He specializes in internal medicine and has a strong background in diagnosing and treating a wide range of medical conditions. Dr. Doe is known for his patient-centered approach, taking the time to listen to his patients' concerns and providing personalized care. He is dedicated to staying up-to-date with the latest advancements in medicine to ensure his patients receive the best possible care.</p>    
     </div>   
  )
}

export default Doctorpage
