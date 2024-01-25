import { z } from 'zod';
import { privateProcedure, router } from './trpc';
import { TRPCError } from '@trpc/server';
import { getPayloadClient } from '../get-payload';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import mercadopago from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
const preference = new Preference(client);

export const paymentRouter = router({

  // Agrega credenciales

  createSession: privateProcedure
    .input(z.object({ productIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { productIds } = input;

      if (productIds.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST' });
      }

      const payload = await getPayloadClient();
      const { docs: products } = await payload.find({
        collection: 'products',
        where: {
          id: {
            in: productIds,
          },
        },
      });

      const filteredProducts = products.filter((prod) => Boolean(prod.priceId));
      const order = await payload.create({
        collection: 'orders',
        data: {
          _isPaid: false,
          products: filteredProducts.map((prod) => prod.id),
          user: user.id,
        },
      });

      const items1 = filteredProducts.map((prod) => ({
        id: prod.id,
        title: prod.name,
        description: prod.description,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: prod.price,
      }));

      const items = filteredProducts.map((prod) => ({
        title: prod.name,
        quantity: 1,
        unit_price: prod.price,
        id: prod.id
      }));

      preference.create({
        body: {
          items,
          back_urls: {
            success: `${process.env.NEXT_PUBLIC_SERVER_URL}/thank-you?orderId=${order.id}`,
            failure: `${process.env.NEXT_PUBLIC_SERVER_URL}/cart`,
          },
          auto_return: 'approved',
          payer: {
            email: user.email,
          },
        }
      })
      .then((res) => {
        console.log(res);
        return { url: res.init_point  }
      })
      .catch((err) => {
        console.log(err);
        return { url: 'http://localhost:3000' };
      });
    }),
  pollOrderStatus: privateProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const { orderId } = input;
      const payload = await getPayloadClient();
      const { docs: orders } = await payload.find({
        collection: 'orders',
        where: {
          id: {
            equals: orderId,
          },
        },
      });

      if (!orders.length) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const [order] = orders;
      return { isPaid: order._isPaid };
    }),
});