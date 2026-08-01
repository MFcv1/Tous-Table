import React from 'react';
import { ArrowRight, CheckCircle2, Landmark } from 'lucide-react';

const OrderSuccessModal = ({ onClose, paymentMethod }) => {
    const isStripe = paymentMethod === 'stripe_elements';

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-stone-950/75 px-3 py-5 backdrop-blur-[14px] animate-in fade-in duration-300">
            <div className="w-full max-w-[440px] rounded-[1.75rem] border border-white/20 bg-white/85 p-1.5 shadow-[0_28px_90px_rgba(28,25,23,0.32)] backdrop-blur-xl animate-in zoom-in-95 slide-in-from-bottom-3 duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
                <div className="relative overflow-hidden rounded-[1.35rem] border border-stone-200/80 bg-[#fbfaf7] px-5 py-6 text-center sm:px-7 sm:py-7">
                    <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />

                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                        <CheckCircle2 size={26} strokeWidth={2.2} />
                    </div>

                    <div className="mt-5 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500">
                            {isStripe ? 'Commande confirmée' : 'Commande prise en compte'}
                        </p>
                        <h2 className="text-2xl font-black leading-tight tracking-tight text-stone-950 sm:text-[1.7rem]">
                            {isStripe ? 'Votre commande est confirmée.' : 'Votre commande est bien réservée.'}
                        </h2>
                        <p className="mx-auto max-w-[330px] text-sm font-medium leading-6 text-stone-600">
                            Votre facture a été envoyée par email avec le récapitulatif (vérifiez vos spams si besoin).
                        </p>
                    </div>

                    <div className="mt-5 rounded-2xl border border-stone-200 bg-white/80 p-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2eee7] text-stone-900">
                                <Landmark size={18} strokeWidth={2.1} />
                            </span>
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-900">
                                    {isStripe ? 'Espace commande' : 'Coordonnées de paiement'}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-stone-600">
                                    {isStripe
                                        ? 'La page Mes commandes contient les détails de votre achat.'
                                        : 'IBAN, Wero, montant et détails de la commande sont regroupés au même endroit.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5">
                        <button
                            onClick={onClose}
                            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-[0_16px_34px_rgba(28,25,23,0.24)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-stone-800 active:scale-[0.985]"
                        >
                            <span>Voir mes commandes</span>
                            <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderSuccessModal;
