from pydantic import BaseModel, ConfigDict

# Plafond d'un montant en FCFA (prix convenu, avance, recette). Au-dela,
# c'est une faute de frappe — dix millions de FCFA, ce n'est plus un travail
# de couture. Le meme plafond est applique cote web (lib/validation.ts).
AMOUNT_MAX = 10_000_000


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
