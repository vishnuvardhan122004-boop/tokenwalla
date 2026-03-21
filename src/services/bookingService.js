import API from './api';

export const getQueue        = (hospitalId) => API.get(`/bookings/queue/${hospitalId}/`);
export const callNext        = (bookingId)  => API.patch(`/bookings/call/${bookingId}/`);
export const completeBooking = (bookingId)  => API.patch(`/bookings/complete/${bookingId}/`);
export const getMyBookings   = ()           => API.get('/bookings/my/');
