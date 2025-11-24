import { Router } from 'express';
import { FlightController } from '../controllers/FlightController';

const router = Router();
const flightController = new FlightController();

// Flight routes - match voi cac methods co san trong FlightController
router.get('/GetAllFlights', flightController.getAllFlights.bind(flightController));
router.post('/SearchFlight', flightController.searchFlights.bind(flightController));
router.post('/Add', flightController.createFlight.bind(flightController));
router.post('/Edit', flightController.editFlight.bind(flightController));
router.post('/Delete', flightController.deleteFlight.bind(flightController));
router.put('/status', flightController.updateFlightStatus.bind(flightController));

// Internal APIs for other services
router.get('/:flightId', flightController.getFlightById.bind(flightController));
router.post('/:flightId/reserve-seat', flightController.reserveSeat.bind(flightController));
router.post('/:flightId/release-seat', flightController.releaseSeat.bind(flightController));

export default router;