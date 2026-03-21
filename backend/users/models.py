from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    mobile = models.CharField(max_length=15, unique=True)
    role   = models.CharField(max_length=20,
               choices=[('patient','Patient'),('hospital','Hospital'),('admin','Admin')],
               default='patient')
    status = models.CharField(max_length=20, default='active')
    USERNAME_FIELD  = 'mobile'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return f"{self.username} ({self.mobile})"
