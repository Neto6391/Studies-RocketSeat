import Appointment from '../models/Appointment';
import { startOfHour, parseISO, isBefore, format, subHours } from 'date-fns';
import pt from 'date-fns/locale/pt';
import User from '../models/User';
import File from '../models/File';
import Notification from '../schemas/Notification';
import * as yup from 'yup';

import CancellationMail from '../jobs/CancellationMail';
import Queue from '../../lib/Queue';

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

        /**
         * Check if User is create appointment with himself
         */
        const user = await User.findByPk(req.userId);

        if (user.id === isProvider.id) {
            return res.status(401).json({
                error: 'You cannot create Appointment with Yourself',
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

        const appointment = await Appointment.create({
            user_id: req.userId,
            provider_id,
            date: hourStart,
        });

        /**
         * Notify appointment provider
         */

        const formattedDate = format(
            hourStart,
            "'dia' dd 'de' MMM', às 'H:mm'h'",
            {
                locale: pt,
            }
        );

        await Notification.create({
            content: `Novo agendamento de ${user.name} para ${formattedDate}`,
            user: provider_id,
        });

        return res.json(appointment);
    }

    async delete(req, res) {
        console.log(req.params.id);
        const appointment = await Appointment.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: 'provider',
                    attributes: ['name', 'email'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['name'],
                },
            ],
        });

        if (appointment.user_id !== req.userId) {
            return res.status(401).json({
                error:
                    "You don't have a permission to cancel this appointment.",
            });
        }

        /**
         * Check if Subtraction 2 hours is Before of Date Now
         */
        const dateWithSub = subHours(appointment.date, 2);

        if (isBefore(dateWithSub, new Date())) {
            return res.status(401).json({
                error: 'You can only cancel appointments 2 hours advance.',
            });
        }

        appointment.canceled_at = new Date();

        await appointment.save();

        await Queue.add(CancellationMail.key, {
            appointment,
        });

        return res.json(appointment);
    }
}

export default new AppointmentController();
