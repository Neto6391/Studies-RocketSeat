import Appointment from '../models/Appointment';
import { Op } from 'sequelize';

import {
    startOfDay,
    endOfDay,
    setHours,
    setMinutes,
    setSeconds,
    format,
    isAfter,
} from 'date-fns';

class AvailableController {
    async index(req, res) {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Invalid Date' });
        }

        const searchDate = Number(date);

        const appointments = await Appointment.findAll({
            where: {
                provider_id: req.params.providerId,
                canceled_at: null,
                date: {
                    [Op.between]: [
                        startOfDay(searchDate),
                        endOfDay(searchDate),
                    ],
                },
            },
        });

        /**
         * All Schedules Available for a what it have service provider
         * Proposition for change this block of code:
         *  - Have Table for save Schedules
         *  - A service provider choose schedules want attend
         */
        const schedule = [
            '8:00',
            '9:00',
            '10:00',
            '11:00',
            '12:00',
            '13:00',
            '14:00',
            '15:00',
            '16:00',
            '17:00',
            '18:00',
            '19:00',
        ];

        const available = schedule.map(time => {
            const [hour, minute] = time.split(':');

            //Set Schedule for format '2020-02-24 14:00:00'
            const value = setSeconds(
                setMinutes(setHours(searchDate, hour), minute),
                0
            );
            //Check Schedule passed on actual time and Schedule not occupied in a appointment
            return {
                time,
                value: format(value, "yyyy-MM-dd'T'HH:mm:ssxx"),
                available:
                    isAfter(value, new Date()) &&
                    !appointments.find(a => format(a.date, 'HH:mm') === time),
            };
        });

        return res.json(available);
    }
}

export default new AvailableController();
