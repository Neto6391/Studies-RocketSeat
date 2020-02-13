import Appointment from '../models/Appointment';
import { startOfHour, parseISO, isBefore } from 'date-fns';
import User from '../models/User';
import File from '../models/File';
import * as yup from 'yup';

class AppointmentController {
    async index(req, res) {
        const { page = 1 } = req.query;

        const appointments = await Appointment.findAll({
            where: {
                user_id: req.userId,
                canceled_at: null,
            },
            order: ['date'],
            limit: 20,
            offset: (page - 1) * 20,
            attributes: ['id', 'date'],
            include: [
                {
                    model: User,
                    as: 'provider',
                    attributes: ['id', 'name'],
                    include: [
                        {
                            model: File,
                            as: 'avatar',
                            attributes: ['id', 'path', 'url'],
                        },
                    ],
                },
            ],
        });

        return res.json(appointments);
    }

    async store(req, res) {
        const schema = yup.object().shape({
            provider_id: yup.number().required(),
            date: yup.date().required(),
        });

        if (!(await schema.isValid(req.body))) {
            return res.status(400).json({
                error: 'Validation fails',
            });
        }

        const { provider_id, date } = req.body;

        /**
         *  Check if provider is a provider
         */
        const isProvider = await User.findOne({
            where: { id: provider_id, provider: true },
        });

        if (!isProvider) {
            return res.status(401).json({
                error: 'You can only create appointments with providers',
            });
        }

        const hourStart = startOfHour(parseISO(date));

        /**
         *  Check for past dates
         */
        if (isBefore(hourStart, new Date())) {
            return res.status(400).json({
                error: 'Past dates are not permitted',
            });
        }

        /**
         *  Check date availability
         */
        const checkAvailability = await Appointment.findOne({
            where: {
                provider_id,
                canceled_at: null,
                date: hourStart,
            },
        });

        if (checkAvailability) {
            return res.status(400).json({
                error: 'Appointmenet date is not available',
            });
        }

        const appoitment = await Appointment.create({
            user_id: req.userId,
            provider_id,
            date: hourStart,
        });

        return res.json(appoitment);
    }
}

export default new AppointmentController();